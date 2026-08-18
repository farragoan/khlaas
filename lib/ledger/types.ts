export interface LedgerItem {
  id: string;
  totalPrice: string; // NUMERIC from DB comes as string
  isFee: boolean;
  quantity: number;
}

export interface LedgerParticipant {
  id: string;
  displayName: string;
}

export interface LedgerSelection {
  participantId: string;
  itemId: string;
  quantity: number;
}

export interface LedgerPayment {
  participantId: string;
  amount: number;
}

export interface LedgerResult {
  fromParticipant: string;
  toParticipant: string;
  amount: number; // rounded to 2 decimal places
}

export interface ParticipantItemShare {
  itemId: string;
  quantity: number;
  amount: number;
}

/**
 * What one person owes and why, before debt simplification. LedgerResult says
 * who hands money to whom; this says how each person's number was arrived at,
 * which is what an exported bill has to show.
 */
export interface ParticipantBreakdown {
  participantId: string;
  itemShares: ParticipantItemShare[];
  fees: number;
  tip: number;
  owes: number;
  paid: number;
  net: number;
}
