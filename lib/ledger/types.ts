export interface LedgerItem {
  id: string;
  totalPrice: string; // NUMERIC from DB comes as string
  isFee: boolean;
}

export interface LedgerParticipant {
  id: string;
  displayName: string;
}

export interface LedgerSelection {
  participantId: string;
  itemId: string;
}

export interface LedgerResult {
  fromParticipant: string;
  toParticipant: string;
  amount: number; // rounded to 2 decimal places
}
