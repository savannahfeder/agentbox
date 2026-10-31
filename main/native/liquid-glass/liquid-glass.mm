// The Mac's own Liquid Glass behind an Electron window's page (macOS 26).
//
// A page cannot see the screen behind its window, so CSS cannot make glass of
// it. NSGlassEffectView can, and it is drawn by the system, so nothing here
// reads the screen or needs a permission. The class is looked up by name, so
// this builds with an older SDK and does nothing on a Mac that lacks it.
//
//   available()                    -> whether this Mac has the glass
//   set(handle, rect, { radius, tone, style })
//                                  -> place it; rect in points from the top left.
//                                     tone 'light' or 'dark' holds it that way;
//                                     without one it decides for itself.
//                                     style 'clear' is the clear glass, which a
//                                     light page shows through; otherwise regular
//   clear(handle)                  -> take it away
//   tone(handle)                   -> 'light' or 'dark': the glass's appearance.
//                                     On macOS 27 this is the Mac's own setting
//                                     whatever is behind it, so it is a fallback
//   luma(handle)                   -> how bright the screen behind the glass is,
//                                     0 to 1, or null until there is a reading
//
// The brightness comes from the glass's own backdrop layer, which the system
// samples for the blur; asked to track luma, it reports it to the layer's
// delegate. That is not published API, so every step is asked for first and
// a Mac without it gets null, and the tray the glass's appearance.
//
// `handle` is BrowserWindow.getNativeWindowHandle(): the window's NSView.
#include <node_api.h>
#include <unordered_map>
#import <AppKit/AppKit.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>
#import <objc/runtime.h>

static NSString *const kGlassId = @"agentbox-liquid-glass";

// NSGlassEffectView's published style (macOS 26): 0 regular, 1 clear. Declared
// here because the SDK this builds with may predate the class.
@protocol AgentboxGlassStyle
- (void)setStyle:(NSInteger)style;
@end

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

static double Number(napi_env env, napi_value object, const char *key, double fallback) {
  bool has = false;
  napi_valuetype type;
  if (napi_typeof(env, object, &type) != napi_ok || type != napi_object) return fallback;
  if (napi_has_named_property(env, object, key, &has) != napi_ok || !has) return fallback;
  napi_value value;
  double out;
  if (napi_get_named_property(env, object, key, &value) != napi_ok) return fallback;
  if (napi_get_value_double(env, value, &out) != napi_ok || !isfinite(out)) return fallback;
  return out;
}

static bool Says(napi_env env, napi_value object, const char *key, const char *word) {
  bool has = false;
  napi_valuetype type;
  if (napi_typeof(env, object, &type) != napi_ok || type != napi_object) return false;
  if (napi_has_named_property(env, object, key, &has) != napi_ok || !has) return false;
  napi_value value;
  char text[16];
  size_t length = 0;
  if (napi_get_named_property(env, object, key, &value) != napi_ok) return false;
  if (napi_get_value_string_utf8(env, value, text, sizeof(text), &length) != napi_ok) return false;
  return strcmp(text, word) == 0;
}

static NSView *GlassIn(NSView *root) {
  for (NSView *view in root.subviews) {
    if ([view.identifier isEqualToString:kGlassId]) return view;
  }
  return nil;
}

static napi_value Bool(napi_env env, bool value) {
  napi_value out;
  napi_get_boolean(env, value, &out);
  return out;
}

static napi_value Available(napi_env env, napi_callback_info) { return Bool(env, GlassClass() != nil); }

static napi_value Set(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  Class glassClass = GlassClass();
  NSView *root = argc > 0 ? ViewOf(env, argv[0]) : nil;
  if (!glassClass || !root || argc < 2) return Bool(env, false);
  double x = Number(env, argv[1], "x", 0), y = Number(env, argv[1], "y", 0);
  double width = Number(env, argv[1], "width", 0), height = Number(env, argv[1], "height", 0);
  if (width <= 0 || height <= 0) return Bool(env, false);
  double radius = argc > 2 ? Number(env, argv[2], "radius", height / 2) : height / 2;
  NSRect bounds = root.bounds;
  NSRect frame = NSMakeRect(x, root.isFlipped ? y : bounds.size.height - y - height, width, height);

  NSView *glass = GlassIn(root);
  if (!glass) {
    glass = [[glassClass alloc] initWithFrame:frame];
    glass.identifier = kGlassId;
    // The glass holds its place from the window's top left as the window
    // changes size, the way the page's own layout does.
    glass.autoresizingMask = root.isFlipped ? (NSViewMaxXMargin | NSViewMaxYMargin) : (NSViewMaxXMargin | NSViewMinYMargin);
    // Its content view is empty. The glass sets that view's appearance to
    // light or dark from what is behind it, which is what tone() reads.
    NSView *content = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, width, height)];
    if ([glass respondsToSelector:@selector(setContentView:)]) [(id)glass setContentView:content];
    [content release];
    [root addSubview:glass positioned:NSWindowBelow relativeTo:nil];
    [glass release];
  }
  glass.frame = frame;
  if ([glass respondsToSelector:@selector(setCornerRadius:)]) [(id)glass setCornerRadius:radius];
  bool clear = argc > 2 && Says(env, argv[2], "style", "clear");
  if ([glass respondsToSelector:@selector(setStyle:)]) [(id<AgentboxGlassStyle>)glass setStyle:clear ? 1 : 0];
  bool light = argc > 2 && Says(env, argv[2], "tone", "light");
  bool dark = argc > 2 && Says(env, argv[2], "tone", "dark");
  glass.appearance = light ? [NSAppearance appearanceNamed:NSAppearanceNameAqua]
                   : dark ? [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] : nil;
  return Bool(env, true);
}

static napi_value Clear(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  NSView *root = argc > 0 ? ViewOf(env, argv[0]) : nil;
  [(root ? GlassIn(root) : nil) removeFromSuperview];
  napi_value out;
  napi_get_undefined(env, &out);
  return out;
}

static napi_value Tone(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  NSView *root = argc > 0 ? ViewOf(env, argv[0]) : nil;
  NSView *glass = root ? GlassIn(root) : nil;
  NSView *content = [glass respondsToSelector:@selector(contentView)] ? [(id)glass contentView] : nil;
  napi_value out;
  if (!content) {
    napi_get_null(env, &out);
    return out;
  }
  NSAppearanceName name = [content.effectiveAppearance bestMatchFromAppearancesWithNames:@[ NSAppearanceNameAqua, NSAppearanceNameDarkAqua ]];
  napi_create_string_utf8(env, [name isEqualToString:NSAppearanceNameDarkAqua] ? "dark" : "light", NAPI_AUTO_LENGTH, &out);
  return out;
}

static char kLumaKey;
static char kWatchedKey;
static SEL TracksLuma() { return NSSelectorFromString(@"setTracksLuma:"); }
static SEL LumaRate() { return NSSelectorFromString(@"setLumaUpdateRate:"); }
static SEL DidChangeLuma() { return NSSelectorFromString(@"backdropLayer:didChangeLuma:"); }

// The delegate's own handler for each class hooked, called after the reading
// is kept, so the glass goes on doing whatever it does with it.
static std::unordered_map<Class, IMP> lumaHandlers;

static void KeepLuma(id self, SEL cmd, CALayer *layer, double luma) {
  if (layer) objc_setAssociatedObject(layer, &kLumaKey, @(luma), OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  for (Class k = object_getClass(self); k; k = class_getSuperclass(k)) {
    auto found = lumaHandlers.find(k);
    if (found == lumaHandlers.end()) continue;
    if (found->second && found->second != (IMP)KeepLuma) ((void (*)(id, SEL, CALayer *, double))found->second)(self, cmd, layer, luma);
    return;
  }
}

static void HookLuma(Class k) {
  if (!k || lumaHandlers.count(k)) return;
  Method had = class_getInstanceMethod(k, DidChangeLuma());
  IMP before = had ? method_getImplementation(had) : nullptr;
  if (!class_addMethod(k, DidChangeLuma(), (IMP)KeepLuma, "v@:@d")) {
    before = method_setImplementation(class_getInstanceMethod(k, DidChangeLuma()), (IMP)KeepLuma);
  }
  lumaHandlers[k] = before;
}

static CALayer *BackdropIn(CALayer *layer, int depth) {
  Class backdrop = NSClassFromString(@"CABackdropLayer");
  if (!layer || !backdrop || depth > 12) return nil;
  if ([layer isKindOfClass:backdrop]) return layer;
  for (CALayer *sub in layer.sublayers) {
    CALayer *found = BackdropIn(sub, depth + 1);
    if (found) return found;
  }
  return nil;
}

// The backdrop layer appears once the glass has drawn, so this is tried on
// every reading until it takes.
static CALayer *WatchedBackdrop(NSView *glass) {
  CALayer *layer = BackdropIn(glass.layer, 0);
  if (!layer || ![layer respondsToSelector:TracksLuma()] || !layer.delegate) return nil;
  if (!objc_getAssociatedObject(layer, &kWatchedKey)) {
    HookLuma(object_getClass(layer.delegate));
    ((void (*)(id, SEL, BOOL))objc_msgSend)(layer, TracksLuma(), YES);
    if ([layer respondsToSelector:LumaRate()]) ((void (*)(id, SEL, double))objc_msgSend)(layer, LumaRate(), 0.25);
    objc_setAssociatedObject(layer, &kWatchedKey, @YES, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  return layer;
}

static napi_value Luma(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  NSView *root = argc > 0 ? ViewOf(env, argv[0]) : nil;
  NSView *glass = root ? GlassIn(root) : nil;
  CALayer *layer = glass ? WatchedBackdrop(glass) : nil;
  NSNumber *luma = layer ? objc_getAssociatedObject(layer, &kLumaKey) : nil;
  napi_value out;
  if (luma) napi_create_double(env, luma.doubleValue, &out);
  else napi_get_null(env, &out);
  return out;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor props[] = {
    { "available", nullptr, Available, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "set", nullptr, Set, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "clear", nullptr, Clear, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "tone", nullptr, Tone, nullptr, nullptr, nullptr, napi_default, nullptr },
    { "luma", nullptr, Luma, nullptr, nullptr, nullptr, napi_default, nullptr },
  };
  napi_define_properties(env, exports, sizeof(props) / sizeof(props[0]), props);
  return exports;
}

NAPI_MODULE(liquid_glass, Init)
