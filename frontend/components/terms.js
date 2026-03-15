/**
 * Terms and conditions screen component.
 * @module components/terms
 */

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, onDone: () => void }} opts
 */
export function renderTerms(container, { health, storage, api, onDone }) {
  const termsVersion = health?.terms_version || 'v1';

  container.innerHTML = `
    <div class="terms-card">
      <h2>Gebruiksvoorwaarden AI Toolkit</h2>

      <div class="terms-section">
        <span class="terms-icon">🔒</span>
        <div>
          <h4>Privacy &amp; lokale verwerking</h4>
          <p>Alle AI-verwerking gebeurt lokaal op dit systeem. Er wordt geen data naar
             externe servers verstuurd. Desondanks: voer geen onnodige persoonsgegevens in.</p>
        </div>
      </div>

      <div class="terms-section">
        <span class="terms-icon">⚠️</span>
        <div>
          <h4>Gevoelige gegevens</h4>
          <p>Wees bewust van wat je invoert. Vermijd het invoeren van BSN-nummers,
             wachtwoorden, creditcardgegevens en medische gegevens tenzij strikt
             noodzakelijk voor je taak.</p>
        </div>
      </div>

      <div class="terms-section">
        <span class="terms-icon">🤖</span>
        <div>
          <h4>AI maakt fouten</h4>
          <p>Kunstmatige intelligentie kan onjuiste, onvolledige of misleidende resultaten
             geven. Controleer AI-output altijd zelf. Gebruik resultaten nooit als enige
             bron voor belangrijke beslissingen.</p>
        </div>
      </div>

      <div class="terms-section">
        <span class="terms-icon">📋</span>
        <div>
          <h4>Verantwoord gebruik</h4>
          <p>Gebruik deze tool professioneel en in lijn met het
             informatiebeveiligingsbeleid van de organisatie. Bij twijfel: raadpleeg
             je leidinggevende.</p>
        </div>
      </div>

      <hr class="divider">

      <label class="terms-accept-row" aria-label="Akkoord gaan met voorwaarden">
        <input type="checkbox" id="terms-checkbox" aria-required="true">
        <span>Ik heb de voorwaarden gelezen en ga akkoord</span>
      </label>

      <button id="terms-continue-btn" class="btn btn-primary btn-lg" disabled
              aria-label="Doorgaan naar de applicatie">
        Ga verder
      </button>
    </div>
  `;

  const checkbox = container.querySelector('#terms-checkbox');
  const btn = container.querySelector('#terms-continue-btn');

  checkbox.addEventListener('change', () => {
    btn.disabled = !checkbox.checked;
  });

  btn.addEventListener('click', async () => {
    if (!checkbox.checked) return;
    btn.disabled = true;
    btn.textContent = 'Bezig...';

    storage.setTermsAccepted(termsVersion);

    // Notify backend for audit (fire-and-forget)
    try {
      await api.post('/health', {}).catch(() => {});
    } catch { /* ignore */ }

    onDone();
  });
}
