(async () => {
  /* =========================================================
     عدّل الجزء ده فقط
  ========================================================= */

  const CONFIG = {
    // اكتب التاريخ كما يظهر في aria-label داخل Teams.
    // مثال:
    // ['Tuesday, June 23, 2026']
    // اتركها [] لمعالجة الاجتماعات المطابقة في اليوم الظاهر حاليًا.
    targetDates: ['Tuesday, June 23, 2026'],

    // الفترات الزمنية المطلوب معالجتها.
    // تقدر تضيف فترة واحدة أو أكثر.
    // اتركها [] لمعالجة كل أوقات الاجتماعات الظاهرة.
    timeRanges: [
      {
        start: '2:00 PM',
        end: '5:00 PM'
      }
    ],

    // اتركها [] لمعالجة كل أسماء الاجتماعات.
    // مثال لمعالجة اجتماعات L2 فقط:
    // titleIncludes: ['L2_']
    //
    // لو كتبت أكثر من قيمة، الاجتماع يكفي أن يطابق واحدة منها.
    titleIncludes: [],

    // تجاهل الاجتماعات التي تحتوي أسماؤها على أي قيمة هنا.
    // مثال:
    // titleExcludes: ['TEST', 'Cancelled']
    titleExcludes: [],

    // null = معالجة كل الاجتماعات المطابقة.
    // 3 = أول 3 فقط للتجربة.
    limit: null,

    // true = يعرض الاجتماعات فقط بدون تعديل أي شيء.
    // false = ينفذ التعديل فعليًا.
    previewOnly: false,

    // عدد محاولات كل Meeting عند حدوث خطأ.
    retriesPerMeeting: 1,

    // الانتظار بين الاجتماعات.
    delayBetweenMeetingsMs: 1500,

    // يقف قليلًا بعد كل عدد من الاجتماعات.
    pauseEvery: 10,
    pauseDurationMs: 5000,

    // أقصى وقت انتظار لظهور الأزرار.
    timeoutMs: 25000
  };

  /* =========================================================
     لا تعدّل ما تحت هذا السطر
  ========================================================= */

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  window.__stopTeamsAutoRecord = false;
  window.__teamsAutoRecordResults = [];

  const visible = el => {
    if (!el) return false;

    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  };

  const normalizeText = value =>
    (value || '')
      .replace(/\s+/g, ' ')
      .trim();

  const elementText = el =>
    normalizeText(
      [
        el?.innerText,
        el?.getAttribute?.('aria-label'),
        el?.getAttribute?.('title')
      ]
        .filter(Boolean)
        .join(' ')
    );

  const meetingTitleFromLabel = label =>
    normalizeText(
      (label || '')
        .split(',')[0]
        .replace(/Microsoft Teams Meeting/gi, '')
    );

  const waitFor = async (
    finder,
    errorMessage,
    timeout = CONFIG.timeoutMs,
    interval = 300
  ) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      if (window.__stopTeamsAutoRecord) {
        throw new Error('Automation stopped manually');
      }

      const result = finder();

      if (result) {
        return result;
      }

      await sleep(interval);
    }

    throw new Error(errorMessage);
  };

  const matchesMeeting = el => {
    if (!visible(el)) return false;

    const label = el.getAttribute('aria-label') || '';

    if (!/Microsoft Teams Meeting/i.test(label)) {
      return false;
    }

    const dateMatches =
      CONFIG.targetDates.length === 0 ||
      CONFIG.targetDates.some(date =>
        label.includes(date)
      );

    const timeMatches =
      CONFIG.timeRanges.length === 0 ||
      CONFIG.timeRanges.some(range =>
        label.includes(`${range.start} to ${range.end}`)
      );

    const title = meetingTitleFromLabel(label);
    const lowerTitle = title.toLowerCase();

    const includeMatches =
      CONFIG.titleIncludes.length === 0 ||
      CONFIG.titleIncludes.some(value =>
        lowerTitle.includes(value.toLowerCase())
      );

    const excluded = CONFIG.titleExcludes.some(value =>
      lowerTitle.includes(value.toLowerCase())
    );

    return (
      dateMatches &&
      timeMatches &&
      includeMatches &&
      !excluded
    );
  };

  const getMatchingMeetings = () =>
    [...document.querySelectorAll('[role="button"]')]
      .filter(matchesMeeting)
      .sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();

        if (rectA.y !== rectB.y) {
          return rectA.y - rectB.y;
        }

        return rectA.x - rectB.x;
      });

  const buildMeetingPlan = meetings => {
    const occurrenceCounts = new Map();

    return meetings.map((el, index) => {
      const label = el.getAttribute('aria-label') || '';
      const occurrence =
        occurrenceCounts.get(label) || 0;

      occurrenceCounts.set(label, occurrence + 1);

      return {
        number: index + 1,
        ariaLabel: label,
        occurrence,
        title: meetingTitleFromLabel(label),
        time: label
          .split(',')
          .find(part => /\d+:\d+\s*(AM|PM)\s+to/i.test(part))
          ?.trim() || '',
        date: CONFIG.targetDates.find(date =>
          label.includes(date)
        ) || ''
      };
    });
  };

  const findPlannedMeeting = item => {
    const matches = getMatchingMeetings()
      .filter(el =>
        (el.getAttribute('aria-label') || '') ===
        item.ariaLabel
      );

    return matches[item.occurrence] || null;
  };

  const findVisibleControl = regex =>
    [
      ...document.querySelectorAll(
        'button, [role="button"], a, [role="link"]'
      )
    ].find(el =>
      visible(el) &&
      regex.test(elementText(el))
    );

  const pressEscape = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true
      })
    );
  };

  const closeTopDialog = async () => {
    const closeButtons = [
      ...document.querySelectorAll('button')
    ].filter(el => {
      const ariaLabel =
        el.getAttribute('aria-label') || '';

      return (
        visible(el) &&
        /^Close$/i.test(ariaLabel)
      );
    });

    const closeButton = closeButtons.at(-1);

    if (!closeButton) {
      return false;
    }

    closeButton.click();
    await sleep(800);

    return true;
  };

  const returnToCalendar = async () => {
    pressEscape();
    await sleep(400);

    for (let attempt = 0; attempt < 6; attempt++) {
      if (getMatchingMeetings().length > 0) {
        return true;
      }

      const closed = await closeTopDialog();

      if (!closed) {
        pressEscape();
        await sleep(600);
      }
    }

    return getMatchingMeetings().length > 0;
  };

  const openMeetingOptions = async meeting => {
    meeting.click();

    const editButton = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            'button, [role="button"]'
          )
        ].find(el => {
          if (!visible(el)) return false;

          const ariaLabel =
            el.getAttribute('aria-label') || '';
          const text =
            normalizeText(el.innerText);

          return (
            ariaLabel === 'Edit' ||
            /^Edit$/i.test(text)
          );
        }),
      'Edit button not found'
    );

    editButton.click();

    const optionsButton = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            'button[aria-label*="online meeting options"]'
          )
        ].find(visible) ||
        findVisibleControl(
          /change the online meeting options/i
        ),
      'Meeting options button not found'
    );

    optionsButton.click();

    return waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-tid="AutoRecordAndTranscribeMode"]'
          )
        ].find(visible),
      'Auto-record dropdown not found'
    );
  };

  const enableAutoRecording = async () => {
    const combo = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-tid="AutoRecordAndTranscribeMode"]'
          )
        ].find(visible),
      'Auto-record dropdown not found'
    );

    combo.click();

    const recordOption = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-tid="AutoRecordingAndTranscription"]'
          )
        ].find(visible),
      'Record and transcribe option not found',
      12000
    );

    const alreadyEnabled =
      recordOption.getAttribute('aria-selected') ===
      'true';

    if (alreadyEnabled) {
      pressEscape();
      await sleep(400);

      return {
        status: 'Already enabled'
      };
    }

    recordOption.click();
    await sleep(500);

    const applyButton = await waitFor(
      () =>
        [...document.querySelectorAll('button')]
          .find(el => {
            const text =
              normalizeText(el.innerText);

            return (
              visible(el) &&
              /^Apply$/i.test(text) &&
              !el.disabled
            );
          }),
      'Enabled Apply button not found',
      12000
    );

    applyButton.click();
    await sleep(1500);

    return {
      status: 'Updated'
    };
  };

  let initialMeetings = getMatchingMeetings();

  if (
    typeof CONFIG.limit === 'number' &&
    CONFIG.limit > 0
  ) {
    initialMeetings =
      initialMeetings.slice(0, CONFIG.limit);
  }

  const meetingPlan =
    buildMeetingPlan(initialMeetings);

  if (meetingPlan.length === 0) {
    console.error(
      'No matching Teams meetings were found.'
    );

    console.log(
      'Check the date, time ranges and title filters in CONFIG.'
    );

    return;
  }

  console.log(
    `Found ${meetingPlan.length} matching meetings.`
  );

  console.table(
    meetingPlan.map(item => ({
      number: item.number,
      title: item.title,
      time: item.time,
      date: item.date || 'Visible calendar date'
    }))
  );

  if (CONFIG.previewOnly) {
    console.warn(
      'Preview mode is enabled. No meetings were changed.'
    );

    window.__teamsAutoRecordPlan = meetingPlan;
    return;
  }

  for (
    let index = 0;
    index < meetingPlan.length;
    index++
  ) {
    if (window.__stopTeamsAutoRecord) {
      console.warn(
        'Automation stopped manually.'
      );
      break;
    }

    const plannedMeeting = meetingPlan[index];
    let completed = false;
    let lastError = '';

    for (
      let attempt = 0;
      attempt <= CONFIG.retriesPerMeeting;
      attempt++
    ) {
      try {
        const meeting = await waitFor(
          () => findPlannedMeeting(plannedMeeting),
          `Meeting not found: ${plannedMeeting.title}`
        );

        console.log(
          `[${index + 1}/${meetingPlan.length}] ` +
          `Opening ${plannedMeeting.title}` +
          (
            attempt > 0
              ? ` — retry ${attempt}`
              : ''
          )
        );

        await openMeetingOptions(meeting);

        const result =
          await enableAutoRecording();

        window.__teamsAutoRecordResults.push({
          number: index + 1,
          title: plannedMeeting.title,
          date:
            plannedMeeting.date ||
            'Visible calendar date',
          time: plannedMeeting.time,
          status: result.status,
          error: ''
        });

        if (result.status === 'Updated') {
          console.log(
            `✅ ${plannedMeeting.title}: Updated`
          );
        } else {
          console.log(
            `ℹ️ ${plannedMeeting.title}: Already enabled`
          );
        }

        await returnToCalendar();

        completed = true;
        break;
      } catch (error) {
        lastError =
          error?.message || String(error);

        console.error(
          `❌ ${plannedMeeting.title}: ${lastError}`
        );

        await returnToCalendar();

        if (
          attempt <
          CONFIG.retriesPerMeeting
        ) {
          await sleep(2000);
        }
      }
    }

    if (!completed) {
      window.__teamsAutoRecordResults.push({
        number: index + 1,
        title: plannedMeeting.title,
        date:
          plannedMeeting.date ||
          'Visible calendar date',
        time: plannedMeeting.time,
        status: 'Failed',
        error: lastError
      });
    }

    if (
      CONFIG.pauseEvery > 0 &&
      (index + 1) % CONFIG.pauseEvery === 0 &&
      index + 1 < meetingPlan.length
    ) {
      console.log(
        `Pausing after ${index + 1} meetings...`
      );

      await sleep(
        CONFIG.pauseDurationMs
      );
    } else {
      await sleep(
        CONFIG.delayBetweenMeetingsMs
      );
    }
  }

  const results =
    window.__teamsAutoRecordResults;

  const updated = results.filter(
    item => item.status === 'Updated'
  ).length;

  const alreadyEnabled = results.filter(
    item => item.status ===
      'Already enabled'
  ).length;

  const failed = results.filter(
    item => item.status === 'Failed'
  ).length;

  console.table(results);

  console.log(
    '======================================'
  );
  console.log(
    `Processed: ${results.length}/${meetingPlan.length}`
  );
  console.log(`✅ Updated: ${updated}`);
  console.log(
    `ℹ️ Already enabled: ${alreadyEnabled}`
  );
  console.log(`❌ Failed: ${failed}`);
  console.log(
    '======================================'
  );
})();
