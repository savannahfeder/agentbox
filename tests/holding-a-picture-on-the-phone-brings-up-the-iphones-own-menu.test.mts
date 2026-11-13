// HOLDING A PICTURE ON THE PHONE BRINGS UP THE IPHONE'S OWN MENU.
//
// What broke (2026-11-08, from the phone app): "I can't do a lot of things I'd
// like to, like saving images." Holding a picture brought up a sheet with
// Open in browser and Share or copy link, and nothing could put the picture
// in Photos. A first fix added Save and Share buttons to the picture view and
// was turned down: "It just should behave like a normal image. Like when I
// hold it down ... the little save comes up." So a held picture now gets
// iOS's own menu, the one Photos, Safari and Messages show: the picture lifts
// and Save to Photos, Copy and Share sit under it. It is native code, so this
// reads it, and the phone build is where it is proved.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const swift = read('mobile/modules/picture-menu/ios/PictureMenuModule.swift');
const wrapper = read('mobile/modules/picture-menu/index.tsx');
const markdown = read('mobile/src/ui/Markdown.tsx');
const room = read('mobile/src/app/file.tsx');

describe('the menu', () => {
  it("is iOS's own, offering Save to Photos, Copy and Share with the system's icons", () => {
    expect(swift).toMatch(/UIContextMenuInteraction\(delegate: self\)/);
    const titles = [...swift.matchAll(/UIAction\(title: "([^"]+)", image: UIImage\(systemName: "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
    expect(titles).toEqual([['Save to Photos', 'square.and.arrow.down'], ['Copy', 'doc.on.doc'], ['Share…', 'square.and.arrow.up']]);
  });

  it('saves, copies and shares the picture itself, not its link, which stops working within the hour', () => {
    expect(swift).toMatch(/UIImageWriteToSavedPhotosAlbum\(image/);
    expect(swift).toMatch(/UIPasteboard\.general\.image = image/);
    expect(swift).toMatch(/UIActivityViewController\(activityItems: \[image\]/);
  });

  it('opens on nothing for a picture the phone has no link to', () => {
    expect(swift).toMatch(/guard let uri, let url = URL\(string: uri\) else \{ return nil \}/);
    expect(wrapper).toMatch(/if \(!Native \|\| !uri\) return <>\{children\}<\/>/);
  });

  it('the download ends, and a failure is said rather than swallowed', () => {
    expect(swift).toMatch(/timeoutIntervalForResource = \d+/);
    expect(swift).toMatch(/onTrouble\(\["line": "This picture could not be loaded/);
    expect(swift).toMatch(/onTrouble\(\["line": "This picture could not be saved/);
  });

  it('a press let go as the menu opens does not also open the picture', () => {
    expect(swift).toMatch(/configurationForMenuAtLocation[\s\S]{0,200}cancelReactNativeTouches\(\)/);
  });
});

describe('where it is', () => {
  it('on a picture in a message and on each of a folder\'s pictures', () => {
    expect(markdown.match(/<PictureMenu uri=\{uri\}/g)).toHaveLength(2);
  });

  it('on the picture opened large', () => {
    expect(room).toMatch(/<PictureMenu uri=\{uri\}[^>]*>\s*<Image source=\{pictureSource\(uri\)\}/);
  });

  it('a picture keeps the old sheet only where the native menu is not built in', () => {
    expect(markdown).toMatch(/onLongPress=\{hasPictureMenu \? undefined : \(\) => hold\(src, files\)\}/);
    expect(wrapper).toMatch(/Platform\.OS === 'ios' && requireOptionalNativeModule\('PictureMenu'\)/);
  });

  it('the picture view has no buttons of its own for it', () => {
    expect(room).not.toMatch(/accessibilityLabel=.{0,40}Save to Photos/);
  });
});

describe('the build', () => {
  it('tells Apple why the app adds to Photos, or the first save would close the app', () => {
    expect(read('mobile/app.config.ts')).toMatch(/NSPhotoLibraryAddUsageDescription: '[^']+'/);
  });

  it('builds the module into the iPhone app', () => {
    expect(JSON.parse(read('mobile/modules/picture-menu/expo-module.config.json')).apple.modules).toEqual(['PictureMenuModule']);
    expect(read('mobile/modules/picture-menu/ios/PictureMenu.podspec')).toMatch(/s\.dependency 'ExpoModulesCore'/);
  });
});
