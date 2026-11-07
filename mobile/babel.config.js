// Expo's own preset, and TypeScript taken out of the shared .mts files the app
// imports: the preset only does that for .ts and .tsx.
module.exports = function config(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    overrides: [{ test: (file) => typeof file === 'string' && file.endsWith('.mts'), plugins: [['@babel/plugin-transform-typescript', { allowDeclareFields: true }]] }],
  };
};
