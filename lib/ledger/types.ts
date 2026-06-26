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
