// The page an invitation email's button opens: /invited on the web app.
export const invitedPageOf = (pathname: string, onTheWebApp: boolean): boolean => onTheWebApp && /^\/invited\/?$/.test(pathname);
