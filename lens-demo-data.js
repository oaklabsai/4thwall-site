(function () {
  'use strict';

  // Product demonstration only. The shape mirrors the tested Connect + Atlas
  // presentation contract; no person, provider account or contractor is real.
  window.LENS_DEMO = Object.freeze({
    meta: {
      simulation: true,
      publishable: false,
      contract: 'dual-source-trust-story-v1',
      business: 'Northstar Roofing',
      trade: 'Roofing',
      serviceArea: 'Fairfield County, CT',
      generatedAt: '2026-07-16T08:00:00Z'
    },
    readiness: {
      percent: 78,
      completed: 7,
      total: 9,
      next: 'Review two source records'
    },
    sources: [
      {
        id: 'jobber',
        name: 'Jobber',
        lane: 'Provider-recorded history',
        status: 'connected',
        statusLabel: 'Connected',
        coverage: 'Complete response · Mar 2021–Jun 2026',
        lastSync: 'Today, 8:12 AM',
        records: 9
      },
      {
        id: 'atlas',
        name: 'Atlas',
        lane: 'Atlas front office record',
        status: 'live',
        statusLabel: 'Live',
        coverage: '112 ledger events · operated since 2026',
        lastSync: 'Live',
        records: 112
      }
    ],
    atlas: {
      verifiedJobs: 23,
      responseSample: 42,
      medianResponse: '2.2 sec',
      bookingSample: 26,
      bookingReliability: '88%',
      reviewsEarned: 8,
      rating: '4.8',
      ledgerEntries: 112
    },
    recordSummary: {
      translated: 4,
      visible: 2,
      private: 1,
      questioned: 1,
      duplicatesRemoved: 1,
      unsupportedSkipped: 5
    },
    records: [
      {
        id: 'ev_demo_100',
        source: 'Jobber',
        type: 'Roof replacement',
        objectType: 'Job',
        completed: 'Mar 15, 2021',
        statement: 'Jobber recorded this job as completed on Mar 15, 2021.',
        status: 'visible',
        statusLabel: 'Included',
        proof: 'Provider-recorded completion',
        limitation: 'Does not prove workmanship, payment or homeowner satisfaction.'
      },
      {
        id: 'ev_demo_201',
        source: 'Jobber',
        type: 'Recurring service visit',
        objectType: 'Visit',
        completed: 'May 20, 2026',
        statement: 'Jobber recorded this service visit as completed on May 20, 2026.',
        status: 'visible',
        statusLabel: 'Included',
        proof: 'Provider-recorded completion',
        limitation: 'Does not prove workmanship, payment or homeowner satisfaction.'
      },
      {
        id: 'ev_demo_202',
        source: 'Jobber',
        type: 'Recurring service visit',
        objectType: 'Visit',
        completed: 'Jun 20, 2026',
        statement: 'Jobber recorded this service visit as completed on Jun 20, 2026.',
        status: 'private',
        statusLabel: 'Private',
        proof: 'Provider-recorded completion',
        limitation: 'Kept out of the homeowner preview by the contractor.'
      },
      {
        id: 'ev_demo_500',
        source: 'Jobber',
        type: 'Roof repair',
        objectType: 'Job',
        completed: 'Oct 4, 2025',
        statement: 'Jobber recorded this job as completed on Oct 4, 2025.',
        status: 'questioned',
        statusLabel: 'Questioned',
        proof: 'Provider-recorded completion',
        limitation: 'Held out of the homeowner preview while the source date is reviewed.'
      }
    ],
    homeownerAnswers: [
      {
        id: 'experience',
        question: 'Have they handled work like mine?',
        shortQuestion: 'Project experience',
        status: 'supported',
        sources: ['Provider recorded'],
        answer: 'The available Jobber history includes a completed roof replacement record.',
        limitation: 'A recorded completion is a track-record fact, not proof of workmanship or satisfaction.'
      },
      {
        id: 'response',
        question: 'How are new inquiries handled now?',
        shortQuestion: 'Inquiry handling',
        status: 'supported',
        sources: ['Atlas front office'],
        answer: 'Across 42 answered inquiries in the last 90 days, Atlas recorded a median response of 2.2 seconds.',
        limitation: 'Response time describes the reply path Atlas runs, not availability, lead quality or workmanship.'
      },
      {
        id: 'followthrough',
        question: 'Does work move from commitment to completion?',
        shortQuestion: 'Follow-through',
        status: 'supported',
        sources: ['Provider recorded', 'Atlas front office'],
        answer: 'The provider history is too thin for a historical rate. Separately, Atlas recorded 88% booking-to-completion reliability across 26 bookings.',
        limitation: 'The two evidence classes stay separate. Neither proves quality or homeowner satisfaction.'
      },
      {
        id: 'continuity',
        question: 'Is there evidence of an active operation?',
        shortQuestion: 'Operating continuity',
        status: 'supported',
        sources: ['Provider recorded', 'Atlas front office'],
        answer: 'Provider records span 2021–2026. Since Atlas began operating the workflow, it has recorded 23 completed jobs.',
        limitation: 'Operational activity does not establish licensing, capacity, financial stability, safety or quality.'
      }
    ],
    narrative: 'Northstar Roofing has provider-recorded roof replacement history. Through the Atlas front office 4THWALL runs for it, 42 inquiries were answered with a 2.2-second median response and 23 completed jobs were recorded.',
    globalLimitation: 'This explanation is not a quality score, endorsement, ranking advantage, payment claim, safety claim or guarantee.'
  });
})();
