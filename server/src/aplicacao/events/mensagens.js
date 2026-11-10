/** Mensagens trocadas pela fila (contrato entre Publisher e Consumer). */
export const MENSAGENS = Object.freeze({
  /** payload: { transactionId: number } */
  TRANSACAO_RECEBIDA: "transacao.recebida",
});
