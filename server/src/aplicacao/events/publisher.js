/** Publisher: grava a mensagem na fila persistente (sobrevive a reinícios). */
export function createPublisher(queueRepo, { maxAttempts = 5 } = {}) {
  return {
    publish(type, payload) {
      return queueRepo.insert({ type, payload, maxAttempts });
    },
  };
}
