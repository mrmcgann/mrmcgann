// node --experimental-strip-types tests/links.test.mjs
import { appPath, queryToObject } from "../src/lib/links.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else { fail++; console.log("FAIL", name, "got", got, "want", want); } };

eq("lot", appPath("/lot/10432"), "/lot/10432");
eq("lot absolute", appPath("https://tyrebiter.com.au/lot/10432?x=1"), "/lot/10432");
eq("invoice", appPath("/account/invoices/0f8fad5b-d9cb-469f-a165-70867728950e"), "/invoice/0f8fad5b-d9cb-469f-a165-70867728950e");
eq("handover", appPath("/handover/0123456789abcdef0123456789abcdef"), "/handover/0123456789abcdef0123456789abcdef");
eq("seller dashboard", appPath("/sell/dashboard"), "/sell");
eq("watchlist", appPath("/watchlist"), "/watchlist");
eq("notifications", appPath("/account/notifications"), "/notifications");
eq("account", appPath("/account"), "/account");
eq("bidding deposit", appPath("https://tyrebiter.com.au/account/deposit?bid=12000&lot=10500"), "/deposit?bid=12000&lot=10500");
eq("search keeps the filters", appPath("/auctions?cat=utes&make=Toyota"), "/search?cat=utes&make=Toyota");
eq("join", appPath("/join"), "/join");
eq("unknown goes home", appPath("/terms#t-claims"), "/");
eq("empty goes home", appPath(""), "/");
eq("scheme link", appPath("tyrebiter://lot/10500"), "/lot/10500");
eq("not a lot number", appPath("/lot/abc"), "/");
eq("live auction room", appPath("https://tyrebiter.com.au/live/ex-council-fleet"), "/live/ex-council-fleet");
eq("live: bad name goes home", appPath("/live/../etc"), "/");
eq("an offer after the auction", appPath("https://tyrebiter.com.au/offers/0F8FAD5B-D9CB-469F-A165-70867728950E"), "/offers/0f8fad5b-d9cb-469f-a165-70867728950e");
eq("offer: not an id goes home", appPath("/offers/../../account"), "/");
eq("query", queryToObject("?cat=utes&q=hilux+sr5&max=30000"), { cat: "utes", q: "hilux sr5", max: "30000" });

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
