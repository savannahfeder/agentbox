// The Mac's own Liquid Glass (macOS 26) under the main window's whole page,
// for the Glass switch (main/window-glass.mts). The window is made
// transparent, and where the page paints nothing the desktop shows through
// this glass. It is its own file because the tray's glass
// (main/native/liquid-glass) is pinned to its approved look.
//
//   available()        -> whether this Mac has the glass
//   set(handle, on)    -> show the glass, or hide it. It is light or dark as
//                         the window is (nativeTheme.themeSource).
//
// `handle` is BrowserWindow.getNativeWindowHandle(): the window's NSView.
#include <node_api.h>
#import <AppKit/AppKit.h>

static NSString *const kGlassId = @"agentbox-window-glass";

static Class GlassClass() { return NSClassFromString(@"NSGlassEffectView"); }

static NSView *ViewOf(napi_env env, napi_value value) {
  void *data = nullptr;
  size_t length = 0;
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) return nil;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok || length < sizeof(void *)) return nil;
  id view = (__bridge id)(*(void **)data);
  return [view isKindOfClass:[NSView class]] ? (NSView *)view : nil;
}

static napi_value Bool(napi_env env, bool value) {
  napi_value out;
  napi_get_boolean(env, value, &out);
  return out;
}

static napi_value Available(napi_env env, napi_callback_info) { return Bool(env, GlassClass() != nil); }

static napi_value Set(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  Class glassClass = GlassClass();
  NSView *root = argc > 0 ? ViewOf(env, argv[0]) : nil;
  bool on = false;
  if (!glassClass || !root || argc < 2 || napi_get_value_bool(env, argv[1], &on) != napi_ok) return Bool(env, false);

  NSView *glass = nil;
  for (NSView *view in root.subviews) {
    if ([view.identifier isEqualToString:kGlassId]) glass = view;
  }
  if (!glass) {
    if (!on) return Bool(env, true);
    glass = [[glassClass alloc] initWithFrame:root.bounds];
    glass.identifier = kGlassId;
    glass.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [root addSubview:glass positioned:NSWindowBelow relativeTo:nil];
    [glass release];
  }
  glass.frame = root.bounds;
  glass.hidden = !on;
  return Bool(env, true);
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "available", NAPI_AUTO_LENGTH, Available, nullptr, &fn);
  napi_set_named_property(env, exports, "available", fn);
  napi_create_function(env, "set", NAPI_AUTO_LENGTH, Set, nullptr, &fn);
  napi_set_named_property(env, exports, "set", fn);
  return exports;
}

NAPI_MODULE(window_glass, Init)
