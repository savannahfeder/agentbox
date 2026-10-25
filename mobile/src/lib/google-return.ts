import { nameSlug } from '../../../shared/product-name.mjs';

// Not Linking.createURL: inside Expo Go that is the Mac's Wi-Fi address, and
// the account database refuses any return address whose host is a raw IP,
// whatever its allowed list says. iOS's sign-in sheet hands back any address
// with the scheme it watches, so the app's own address works in Expo Go too.
export const googleReturn = `${nameSlug}://signed-in`;
