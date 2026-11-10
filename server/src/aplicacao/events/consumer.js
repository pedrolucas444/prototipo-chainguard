/**
 * Consumer: lê mensagens da fila e aciona o Service correspondente.
 * Falha → nova tentativa com espera exponencial. Esgotadas as tentativas → fila de mensagens mortas
 * (status 'dead'), de onde o Administrador pode reprocessar.
 *
 * Até `concurrency` mensagens são processadas ao mesmo tempo: a análise passa a maior parte do tempo
 * esperando GoPlus/explorer, e em série um lote de transações estouraria a meta de classificar em até 60 s.
 * O claim é atômico (SQLite síncrono), então duas mensagens nunca pegam a mesma linha.
 */
export function createConsumer({ queueRepo, handlers, logger = console, pollMs = 300, baseDelayMs = 2000, concurrency = 4, onDead }) {
  let timer = null;
  let running = false;
  let stopped = true;

  async function processOne() {
    const message = queueRepo.claimNext(Date.now());
    if (!message) return false;
    const handler = handlers[message.type];
    try {
      if (!handler) throw new Error(`Sem handler para ${message.type}`);
      await handler(message.payload, message);
      queueRepo.markDone(message.id);
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 500);
      if (message.attempts >= message.max_attempts) {
        queueRepo.markDead(message.id, reason);
        logger.warn?.(`[fila] mensagem ${message.id} (${message.type}) movida para a fila de mortas: ${reason}`);
        await onDead?.(message, reason);
      } else {
        const delay = baseDelayMs * 2 ** (message.attempts - 1);
        queueRepo.markRetry(message.id, Date.now() + delay, reason);
      }
    }
    return true;
  }

  async function drain() {
    if (running) return;
    running = true;
    try {
      const worker = async () => { while (!stopped && (await processOne())); };
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    } finally {
      running = false;
    }
  }

  return {
    start() {
      stopped = false;
      queueRepo.recoverStuck();
      timer = setInterval(() => drain().catch(err => logger.error?.("[fila]", err)), pollMs);
      timer.unref?.();
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
    /** Processa tudo o que estiver disponível agora (usado nos testes). */
    async drainNow() {
      const wasStopped = stopped;
      stopped = false;
      while (await processOne());
      stopped = wasStopped;
    },
  };
}
