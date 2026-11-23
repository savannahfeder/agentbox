// A build for the App Store (the `store` profile in eas.json). It leaves out
// what App Review would turn away today: AI teammates and the Alpha features
// page (guideline 2.2). Metro writes the value into the bundle, so nothing can
// switch them on after review.
export const STORE_BUILD = process.env.EXPO_PUBLIC_STORE_BUILD === '1';
