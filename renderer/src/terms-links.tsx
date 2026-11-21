// The two pages a press agrees to, opened in the browser.
export const TERMS_URL = 'https://agentbox.ac/terms';
export const PRIVACY_URL = 'https://agentbox.ac/privacy';

export const TermsLinks = () => <>the <a href={TERMS_URL} onClick={(e) => { e.preventDefault(); window.open(TERMS_URL, '_blank'); }}>Terms</a> and the <a href={PRIVACY_URL} onClick={(e) => { e.preventDefault(); window.open(PRIVACY_URL, '_blank'); }}>Privacy policy</a></>;
