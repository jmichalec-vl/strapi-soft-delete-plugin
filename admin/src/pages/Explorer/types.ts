export interface ContentType {
  readonly uid: string;
  readonly kind: 'collectionType' | 'singleType';
  readonly info: {
    readonly displayName: string;
  };
  readonly isDisplayed: boolean;
}

export interface SoftDeletedEntry {
  readonly id: number;
  readonly documentId: string;
  readonly _softDeletedAt: string;
  readonly _softDeletedBy?: {
    readonly id: number | null;
    readonly type: string;
    readonly name?: string;
  };
  readonly [key: string]: unknown;
}
