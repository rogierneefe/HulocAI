/**
 * Onboarding / introduction screen component.
 * @module components/onboarding
 */

/**
 * @param {HTMLElement} container
 * @param {{ health: object, storage: object, api: object, onDone: () => void }} opts
 */
export function renderOnboarding(container, { health, storage, api, onDone }) {
  const onboardingVersion = health?.onboarding_version || 'v1';
  const videoUrl = health?.video_url || null;

  const videoHtml = videoUrl
    ? `<iframe src="${videoUrl}" class="video-placeholder" style="border:0;width:100%;aspect-ratio:16/9;"
         allowfullscreen title="Introductievideo AI Toolkit"></iframe>`
    : `<div class="video-placeholder">
         <span class="play-icon" aria-hidden="true">▶</span>
         <p>Introductievideo volgt binnenkort</p>
       </div>`;

  container.innerHTML = `
    <div class="onboarding-card">
      <h2>Welkom bij de AI Toolkit van Hogeschool Utrecht</h2>

      ${videoHtml}

      <div class="onboarding-steps">
        <div class="onboarding-step">
          <span class="step-num" aria-hidden="true">1</span>
          <span>Kies een functie links: Transcriberen, Samenvatten, Vertalen of Chat</span>
        </div>
        <div class="onboarding-step">
          <span class="step-num" aria-hidden="true">2</span>
          <span>Kies <strong>Kort</strong> voor een beknopt resultaat of <strong>Uitgebreid</strong> voor meer detail</span>
        </div>
        <div class="onboarding-step">
          <span class="step-num" aria-hidden="true">3</span>
          <span>Voer tekst in of upload een audio- of videobestand</span>
        </div>
        <div class="onboarding-step">
          <span class="step-num" aria-hidden="true">4</span>
          <span>Alle verwerking gebeurt lokaal op dit apparaat — niets verlaat het netwerk</span>
        </div>
      </div>

      <button id="onboarding-continue-btn" class="btn btn-primary btn-lg"
              aria-label="Doorgaan naar de gebruiksvoorwaarden">
        Ga verder
      </button>
    </div>
  `;

  container.querySelector('#onboarding-continue-btn').addEventListener('click', async () => {
    storage.setOnboardingCompleted(onboardingVersion);
    onDone();
  });
}
