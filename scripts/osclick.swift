// A real OS-level press, the kind her trackpad makes: goes through the window
// server, so a native drag region gets its say exactly as it does for her.
//
// GUARDED. Every press names the pid it is meant for, and is refused (exit 3)
// unless the frontmost window under that point belongs to that pid. Her own app
// sits full-screen on this Mac; an unguarded press lands in HER window.
//
//   osclick bounds <pid>              X Y W H of that pid's largest window
//   osclick activate <pid>            bring that app to the front
//   osclick click <pid> <x> <y>       global points, top-left origin
//   osclick cmdkey <pid> <keycode>    only if that pid is frontmost (3 = F)
import AppKit
import CoreGraphics
import Foundation

let a = CommandLine.arguments
let src = CGEventSource(stateID: .hidSystemState)

func windows() -> [[String: Any]] {
  CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
}
func rect(_ w: [String: Any]) -> CGRect {
  let b = w[kCGWindowBounds as String] as! [String: Any]
  return CGRect(x: b["X"] as! Double, y: b["Y"] as! Double, width: b["Width"] as! Double, height: b["Height"] as! Double)
}
func owner(_ w: [String: Any]) -> Int { w[kCGWindowOwnerPID as String] as? Int ?? 0 }
func layer(_ w: [String: Any]) -> Int { w[kCGWindowLayer as String] as? Int ?? 0 }
// Normal (0) and floating (3) windows. The Dock (20), menu bar (24/25) and
// system overlays above them are left out: none sits over the test window's
// buttons, and Wispr Flow's always-up panel (1000) passes clicks through.
func ordinary(_ w: [String: Any]) -> Bool { layer(w) >= 0 && layer(w) < 20 }
func ownerAt(_ p: CGPoint) -> Int {
  for w in windows() where ordinary(w) && rect(w).contains(p) { return owner(w) }
  return -1
}

switch a[1] {
case "bounds":
  let pid = Int(a[2])!
  let mine = windows().filter { owner($0) == pid && ordinary($0) }.map(rect).sorted { $0.width * $0.height > $1.width * $1.height }
  guard let r = mine.first else { print("none"); exit(2) }
  print(r.origin.x, r.origin.y, r.width, r.height)
case "activate":
  let pid = pid_t(Int(a[2])!)
  NSRunningApplication(processIdentifier: pid)?.activate(options: [.activateIgnoringOtherApps])
  usleep(400000)
case "click":
  let pid = Int(a[2])!
  let p = CGPoint(x: Double(a[3])!, y: Double(a[4])!)
  let who = ownerAt(p)
  guard who == pid else { print("refused: the window under \(p) belongs to pid \(who)"); exit(3) }
  CGEvent(mouseEventSource: src, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(120000)
  CGEvent(mouseEventSource: src, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
  usleep(70000)
  CGEvent(mouseEventSource: src, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
case "cmdkey":
  let pid = pid_t(Int(a[2])!)
  guard NSWorkspace.shared.frontmostApplication?.processIdentifier == pid else { print("refused: pid \(pid) is not in front"); exit(3) }
  let k = CGKeyCode(Int(a[3])!)
  let down = CGEvent(keyboardEventSource: src, virtualKey: k, keyDown: true)!
  down.flags = .maskCommand
  down.post(tap: .cghidEventTap)
  usleep(50000)
  let up = CGEvent(keyboardEventSource: src, virtualKey: k, keyDown: false)!
  up.flags = .maskCommand
  up.post(tap: .cghidEventTap)
default:
  exit(1)
}
usleep(100000)
