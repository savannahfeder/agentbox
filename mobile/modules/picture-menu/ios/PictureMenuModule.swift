// Holding a picture brings up iOS's own menu, as it does in Photos, Safari and
// Messages: the picture lifts, the rest blurs, and Save to Photos, Copy and
// Share sit under it.
import ExpoModulesCore
import UIKit

public class PictureMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PictureMenu")

    View(PictureMenuView.self) {
      Events("onTrouble")

      Prop("uri") { (view: PictureMenuView, uri: String?) in
        view.uri = uri
      }

      Prop("corner") { (view: PictureMenuView, corner: Double?) in
        view.corner = CGFloat(corner ?? 0)
      }
    }
  }
}

final class PictureMenuView: ExpoView, UIContextMenuInteractionDelegate {
  var uri: String? {
    didSet { if uri != oldValue { kept = nil } }
  }
  var corner: CGFloat = 0
  let onTrouble = EventDispatcher()
  private var kept: UIImage?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIContextMenuInteraction(delegate: self))
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    guard let uri, let url = URL(string: uri) else { return nil }
    cancelReactNativeTouches()
    fetch(url) { _ in }
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      UIMenu(title: "", children: [
        UIAction(title: "Save to Photos", image: UIImage(systemName: "square.and.arrow.down")) { _ in
          self?.fetch(url) { image in
            UIImageWriteToSavedPhotosAlbum(image, self, #selector(PictureMenuView.saved(_:didFinishSavingWithError:contextInfo:)), nil)
          }
        },
        UIAction(title: "Copy", image: UIImage(systemName: "doc.on.doc")) { _ in
          self?.fetch(url) { image in UIPasteboard.general.image = image }
        },
        UIAction(title: "Share…", image: UIImage(systemName: "square.and.arrow.up")) { _ in
          self?.fetch(url) { image in self?.share(image) }
        },
      ])
    }
  }

  // The lifted picture keeps its rounded corners.
  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    let parameters = UIPreviewParameters()
    parameters.backgroundColor = .clear
    parameters.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: corner)
    return UITargetedPreview(view: self, parameters: parameters)
  }

  // The full picture, not the drawn one, which may be scaled down. Fetched as
  // the menu opens so a choice rarely waits; a request that never answers ends.
  private func fetch(_ url: URL, then use: @escaping (UIImage) -> Void) {
    if let kept {
      use(kept)
      return
    }
    let config = URLSessionConfiguration.default
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = 60
    URLSession(configuration: config).dataTask(with: url) { [weak self] data, response, _ in
      let ok = (response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
      let image = ok ? data.flatMap { UIImage(data: $0) } : nil
      DispatchQueue.main.async {
        guard let self else { return }
        guard let image else {
          self.onTrouble(["line": "This picture could not be loaded. Try again in a moment."])
          return
        }
        if self.uri == url.absoluteString { self.kept = image }
        use(image)
      }
    }.resume()
  }

  @objc func saved(_ image: UIImage, didFinishSavingWithError error: Error?, contextInfo: UnsafeRawPointer) {
    guard error != nil else { return }
    onTrouble(["line": "This picture could not be saved. If Photos is turned off for this app, turn it on in Settings."])
  }

  private func share(_ image: UIImage) {
    var top = window?.rootViewController
    while let shown = top?.presentedViewController { top = shown }
    guard let top else { return }
    let sheet = UIActivityViewController(activityItems: [image], applicationActivities: nil)
    sheet.popoverPresentationController?.sourceView = self
    top.present(sheet, animated: true)
  }

  // A press let go before the menu opens would still reach React Native as a
  // tap and open the picture under the menu (expo-router's LinkPreview does the same).
  private func cancelReactNativeTouches() {
    guard let handler = NSClassFromString("RCTSurfaceTouchHandler") else { return }
    var view: UIView? = self
    while let current = view {
      if let recognizer = current.gestureRecognizers?.first(where: { $0.isKind(of: handler) }) {
        if recognizer.isEnabled {
          recognizer.isEnabled = false
          recognizer.isEnabled = true
        }
        return
      }
      view = current.superview
    }
  }
}
