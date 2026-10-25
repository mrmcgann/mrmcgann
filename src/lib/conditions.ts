// The auction's conditions: what every bidder reads, and accepts, before entering a live auction room (website and
// app). They're the key points of the Terms of Sale, in the same words, each pointing at its section. Accepting them is
// recorded (enter_sale, migration 24), and place_bid refuses a bid in the room without it. Change them with the Terms.
// Pure: website, server and phone app.

export type PayMode = "transfer" | "deposit" | "card";
export type Condition = { head: string; text: string; terms: string };

/** How a win is paid for, as a condition of entry. */
function payCondition(mode: PayMode, days: number): Condition {
  const head = `Pay within ${days} business days.`;
  if (mode === "deposit") return { head, terms: "t-payment",
    text: `If the hammer falls on your bid, the deposit for the price goes towards it straight away, and you pay the balance by PayID or bank transfer within ${days} business days. If you don't, the sale can be cancelled, you lose that deposit and your account is closed.` };
  if (mode === "card") return { head: "Payment when you win.", terms: "t-payment", text: "If the hammer falls on your bid, payment is taken from your card straight away." };
  return { head, terms: "t-payment",
    text: `If the hammer falls on your bid, pay the all-in amount by PayID or bank transfer within ${days} business days. If you don't, the sale can be cancelled and your account closed.` };
}

export function auctionConditions(o: { payMode: PayMode; payDays?: number }): Condition[] {
  const days = o.payDays ?? 2;
  return [
    { head: "We sell for the owner.", terms: "t-agent",
      text: "Tyrebiter sells each vehicle as its owner's agent, in an auction run by our licensed auctioneer. Your contract is with the owner, on our Terms of Sale. We keep the owner's details private and deal with everything for you." },
    { head: "As is, where is.", terms: "t-asis",
      text: "Every vehicle is sold in its condition when the hammer falls, with any faults that aren't described. Condition reports, grades and estimates are a guide only. There's no cooling-off period for a sale by auction." },
    { head: "We're never at the vehicle.", terms: "t-condition",
      text: "The photos and walkaround video are the seller's, taken for the listing, and we check them against the records. There are no viewings or test drives. If you want a mechanic's opinion, order an inspection before the vehicle is offered." },
    { head: "Each tap is a bid.", terms: "t-live",
      text: "In this room, each tap of a bid button is a binding bid at that amount, plus the buyer's premium and fees, with the all-in total shown on the button. You can withdraw a bid until the hammer falls." },
    { head: "The hammer decides.", terms: "t-bidding",
      text: "When the countdown ends, the highest bid buys the vehicle if it meets the reserve. Below the reserve it's passed in: it isn't sold and nobody owes anything, and if you were the highest bidder one of our consultants will be in touch. Where its state allows it (never in Victoria), the seller may then agree to sell it after the auction, by a written offer you'd sign: that isn't a sale by auction, and it comes with your state's protections." },
    payCondition(o.payMode, days),
    { head: "This page counts.", terms: "t-errors",
      text: "The price and countdown on this page are what count, and the auctioneer settles any dispute from the bids we record. We're not responsible for bids that don't reach us because of your device or connection, so leave an early bid on any vehicle that matters to you." },
    { head: "Your consumer rights stay.", terms: "t-asis",
      text: "Nothing here takes away a right you have under the Australian Consumer Law that can't be excluded." },
  ];
}

/** The box a bidder ticks to enter. */
export const CONDITIONS_ACK = "I've read these conditions, and I accept them and the Terms of Sale for this auction.";
