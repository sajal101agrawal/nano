// Consumer email domain blocklist — blocks free/personal email providers.
// Staffing portal registrations must use a company domain email.

export const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.fr", "yahoo.de", "yahoo.es",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.es",
  "outlook.com", "outlook.co.uk", "outlook.in",
  "live.com", "live.co.uk", "live.in",
  "icloud.com", "me.com", "mac.com",
  "msn.com",
  "aol.com",
  "protonmail.com", "proton.me",
  "tutanota.com", "tuta.io",
  "zoho.com",
  "yandex.com", "yandex.ru",
  "mail.com", "email.com", "usa.com", "post.com",
  "inbox.com",
  "gmx.com", "gmx.net", "gmx.de",
  "web.de",
  "rediffmail.com",
  "rocketmail.com",
  "fastmail.com", "fastmail.fm",
  "hushmail.com",
  "lycos.com",
  "excite.com",
  "qq.com", "163.com", "126.com",
  "naver.com",
  "daum.net",
  "seznam.cz",
  "wp.pl", "o2.pl",
  "t-online.de",
  "comcast.net",
  "verizon.net",
  "att.net",
  "sbcglobal.net",
  "bellsouth.net",
  "cox.net",
  "charter.net",
  "earthlink.net",
  "optonline.net",
]);

export function isConsumerDomain(email: string): boolean {
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2) return true;
  return CONSUMER_EMAIL_DOMAINS.has(parts[1]);
}

export function extractDomain(email: string): string | null {
  const parts = email.toLowerCase().trim().split("@");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1];
}
