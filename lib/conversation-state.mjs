// Public conversation state for Atlas and Vesta.
//
// This is intentionally not another model call. It compiles only facts the visitor stated,
// keeps the source turn for every fact, and lets the newest explicit statement replace an
// older one. The language model remains the flexible talker; this layer owns common ground
// when a visitor asks for a recap or an integrated recommendation.

const ATLAS_TRADES = [
  ['roofing', /\b(roof(?:er|ing)?|gutter|siding)\b/i],
  ['HVAC', /\b(hvac|heating|cooling|furnace|air conditioning|heat pump)\b/i],
  ['plumbing', /\b(plumb(?:er|ing)?|drain|pipe|water heater)\b/i],
  ['electrical', /\b(electric(?:al|ian)?|rewir|panel|outlet)\b/i],
  ['painting', /\bpaint(?:er|ing)?\b/i],
  ['masonry', /\b(mason(?:ry)?|chimney|brick|stonework)\b/i],
  ['paving', /\b(pav(?:er|ing)|driveway|asphalt|concrete)\b/i],
  ['landscaping', /\b(landscap|lawn|tree service|arborist)\b/i],
  ['windows and doors', /\b(window|door)\b/i],
];

const VESTA_TRADES = [
  ['roofing', /\b(roof(?:er|ing)?|shingle|flashing|gutter)\b/i],
  ['plumbing', /\b(plumb(?:er|ing)?|pipe|drain|fixture|water heater|bathroom)\b/i],
  ['HVAC', /\b(hvac|heating|cooling|furnace|air conditioning|heat pump)\b/i],
  ['electrical', /\b(electric(?:al|ian)?|panel|rewir|outlet|lighting)\b/i],
  ['painting', /\bpaint(?:er|ing)?\b/i],
  ['masonry', /\b(mason(?:ry)?|chimney|brick|stone|patio)\b/i],
  ['landscaping', /\b(landscap|lawn|tree|arborist)\b/i],
  ['windows and doors', /\b(window|door)\b/i],
  ['paving', /\b(pav(?:er|ing)|driveway|asphalt|concrete)\b/i],
];

function userTurns(messages){
  return (Array.isArray(messages) ? messages : [])
    .map((message, index) => ({
      index,
      text:String(message && message.content || '').trim(),
      role:message && message.role,
    }))
    .filter(turn => turn.role === 'user' && turn.text);
}

function latestFact(turns, classifier){
  for (let i = turns.length - 1; i >= 0; i--){
    const value = classifier(turns[i].text);
    if (value !== null && value !== undefined) {
      return { value, turn:turns[i].index, text:turns[i].text };
    }
  }
  return null;
}

function tradeFact(turns, signals){
  return latestFact(turns, text => signals.find(([, pattern]) => pattern.test(text))?.[0] || null);
}

function atlasLane(text){
  // "Only follow-up after a missed call" is a follow-up correction, not a return to the
  // older missed-call/booking plan. Specific operating lanes therefore outrank carrier words.
  if (/\b(service|warranty)\b[^.?!]{0,45}\b(call(?:s|backs?)?|follow[- ]?up|request|work)\b|\b(call(?:s|backs?)?|follow[- ]?up)\b[^.?!]{0,45}\b(service|warranty)\b/i.test(text)) return 'service';
  if (/\b(follow[- ]?up|call(?:s|ing)? back|callback|unanswered)\b/i.test(text)) return 'followup';
  if (/\b(schedule|scheduling|book|booking|calendar|appointment)\b/i.test(text)) return 'booking';
  if (/\b(storm|hail|weather event|surge)\b/i.test(text)) return 'storm';
  if (/\b(review|reputation)\b/i.test(text)) return 'reviews';
  if (/\b(campaign|seasonal|old leads?|past customers?)\b/i.test(text)) return 'campaigns';
  if (/\b(miss(?:ed|ing)?|unanswered|cannot answer|can(?:'|’)t answer|voicemail)\b[^.?!]{0,42}\b(call|lead|phone)|\b(call|lead|phone)\b[^.?!]{0,42}\b(miss(?:ed|ing)?|unanswered|voicemail)\b/i.test(text)) return 'missed';
  return null;
}

function atlasDesk(text){
  if (/\b(no longer|stopped|got rid of|do not use|don(?:'|’)t use)\b[^.?!]{0,30}\b(answering service|dispatcher|office manager)\b/i.test(text)) return 'none';
  if (/\b(my|our)\s+(wife|husband|spouse|partner|daughter|son|sister|brother|family)\b[^.?!]{0,55}\b(answer|handle|take|run|book|schedule|manage)\w*\b|\bfamily[- ]run desk\b/i.test(text)) return 'family';
  if (/\b(answering service|call center|live answer)\b/i.test(text)) return 'answering_service';
  if (/\bdispatcher\b/i.test(text)) return 'dispatcher';
  if (/\b(office manager|office person|receptionist|admin(?:istrator)?)\b/i.test(text)) return 'office';
  return null;
}

export function buildAtlasConversationState(messages){
  const turns = userTurns(messages);
  return {
    turns:turns.length,
    trade:tradeFact(turns, ATLAS_TRADES),
    lane:latestFact(turns, atlasLane),
    capacity:latestFact(turns, text => {
      if (/\b(not booked|room for|need|want|looking for)\b[^.?!]{0,28}\b(more|new)\s+(work|jobs?|leads?)\b/i.test(text)) return 'open';
      if (/\b(booked (?:out|solid|up)|backlog(?:ged)?|at capacity|cannot take|can(?:'|’)t take|do not need|don(?:'|’)t need|do not want|don(?:'|’)t want)\b[^.?!]{0,45}\b(more|new)?\s*(work|jobs?|leads?)?\b|\b(six weeks?|months?) out\b/i.test(text)) return 'full';
      return null;
    }),
    desk:latestFact(turns, atlasDesk),
    noise:latestFact(turns, text => {
      if (/\b(spam|robocalls?|junk calls?|telemarketers?|marketers?)\b[^.?!]{0,30}\b(no longer|not a problem|handled|filtered)\b/i.test(text)) return 'handled';
      if (/\b(spam|robocalls?|junk calls?|telemarketers?|marketers?)\b|\bcalls?\b[^.?!]{0,20}\bjunk\b/i.test(text)) return 'spam';
      return null;
    }),
    complexity:latestFact(turns, text =>
      /\b(custom|complex|complicated|technical)\b[^.?!]{0,38}\b(job|work|project|quote|estimate)s?\b|\b(job|work|project|quote|estimate)s?\b[^.?!]{0,38}\b(custom|complex|complicated|technical)\b/i.test(text)
        ? 'expert' : null),
    control:latestFact(turns, text =>
      /\b(do not want|don(?:'|’)t want|cannot have|can(?:'|’)t have|worried about|nervous about)\b[^.?!]{0,55}\b(bot|ai|automation|atlas|something|it)\b[^.?!]{0,35}\b(text|message|reply|answer|talk)\w*\b|\bwithout (me|us) (knowing|approving)\b/i.test(text)
        ? 'guarded' : null),
    last:turns.at(-1) || null,
  };
}

const ATLAS_RECAP = /\b(tell me|repeat|show me)\b[^.?!]{0,35}\b(what you (?:understand|heard|know)|your understanding)\b|\bwhat (?:do|have) you (?:understand|understood|heard)\b/i;
const ATLAS_SYNTHESIS = /\b(put (?:that|it|everything) together|based on (?:that|what i (?:said|told you)|everything)|bottom line)\b|\bwhat exactly would you do\b|\bwhat would you leave alone\b|\bbased on that correction\b/i;

function atlasScreen(lane){
  return lane === 'storm' ? 'room:storm'
    : lane === 'booking' ? 'room:book'
    : lane === 'reviews' ? 'room:reviews'
    : lane === 'campaigns' ? 'room:camp'
    : lane === 'followup' || lane === 'service' ? 'room:follow'
    : 'room:lead';
}

function atlasRecap(state){
  const facts = [];
  if (state.trade) facts.push(`you run a ${state.trade.value} company`);
  if (state.capacity?.value === 'full') facts.push('you are booked out');
  if (state.capacity?.value === 'open') facts.push('you still want qualified work');
  if (state.desk?.value === 'family') facts.push('your family-run desk stays in place');
  if (state.desk?.value === 'answering_service') facts.push('your answering service stays in place');
  if (state.desk?.value === 'dispatcher') facts.push('your dispatcher keeps booking');
  if (state.desk?.value === 'office') facts.push('your current office desk stays in place');
  if (state.lane?.value === 'service') facts.push('the uncovered lane is service and warranty callbacks');
  else if (state.lane?.value) facts.push(`the uncovered lane is ${state.lane.value === 'followup' ? 'unanswered follow-up' : state.lane.value}`);
  if (state.noise?.value === 'spam') facts.push('junk calls are noise, not recovered demand');
  const heard = facts.length ? facts.join(', ') : 'I do not yet have enough operating facts to recommend a workflow';
  return `Here is what I understand: ${heard}. If I have any of that wrong, correct it and I will rebuild the recommendation.`;
}

function atlasRecommendation(state){
  const lane = state.lane?.value;
  if (lane === 'followup' && state.desk?.value === 'dispatcher') {
    return 'Start with Follow-up, not Booking. Keep booking with your dispatcher. Atlas should own only the unanswered follow-up after a missed call: keep the lead, next action, and exact owner together, then send any booking-ready reply to the dispatcher. Prove that handoff in a watched test before expanding the lane.';
  }

  const protectedWork = [];
  if (state.capacity?.value === 'full') protectedWork.push('do not use Atlas to create more demand');
  if (state.desk?.value === 'family') protectedWork.push('do not replace your family-run desk');
  if (state.desk?.value === 'answering_service') protectedWork.push('do not duplicate your answering service');
  if (state.desk?.value === 'dispatcher') protectedWork.push('keep booking with your dispatcher');
  if (state.desk?.value === 'office') protectedWork.push('keep the current office desk in charge');
  if (state.noise?.value === 'spam') protectedWork.push('do not count junk calls as value');

  const opening = protectedWork.length
    ? `Based on what you told me: ${protectedWork.join(', ')}.`
    : 'Based on what you told me, Atlas should earn one narrow operating lane before it expands.';
  const laneWork = {
    service:'Put it on one narrow lane: real service and warranty callbacks that arrive when the desk cannot respond; capture the customer, job, and urgency, set only the approved expectation, then hand exceptions back to the current owner in one visible queue.',
    followup:'Start with Follow-up: keep each unanswered lead, next action, and exact owner together, then escalate only the work that remains unresolved.',
    missed:'Start with Lead Response: separate supported inquiries from noise, capture the job, location, and urgency, then offer only an approved next step or hand it to the named person.',
    booking:'Start with Booking: define the estimate slots Atlas may offer, the facts required first, and every exception that must stop with a person.',
    storm:'Start with Storm Mode only after Lead Response works: hold the surge in one queue and send urgent or out-of-rule work to a named person.',
    reviews:'Start with Review Generation only for an eligible completed appointment, with the request tied to the job record.',
    campaigns:'Start with Seasonal Campaigns only after Lead Response is sound, with an explicit audience, owner approval, and handoff.',
  };
  if (!lane) {
    return `${opening} I still do not have an uncovered lane to automate. If every supported inquiry already receives a fast, accountable response, the honest recommendation is no Atlas workflow.`;
  }
  const proof = state.noise?.value === 'spam'
    ? 'Prove it with a watched mix of real and junk calls; if the lane is not measurably cleaner, do not expand.'
    : 'Prove one clean case and one exception in a watched test; if the handoff is not measurably cleaner, do not expand.';
  return `${opening} ${laneWork[lane]} ${proof}`;
}

export function atlasConversationRoute(messages){
  const state = buildAtlasConversationState(messages);
  const text = state.last?.text || '';
  if (state.turns < 2) return null;
  if (ATLAS_RECAP.test(text)) return {
    kind:'recap',
    say:atlasRecap(state),
    screen:atlasScreen(state.lane?.value),
    aud:'contractor',
  };
  if (ATLAS_SYNTHESIS.test(text)) return {
    kind:'synthesis',
    say:atlasRecommendation(state),
    screen:atlasScreen(state.lane?.value),
    aud:'contractor',
  };
  return null;
}

function vestaTrade(turns){
  return tradeFact(turns, VESTA_TRADES);
}

export function buildVestaConversationState(messages){
  const turns = userTurns(messages);
  const combined = turns.map(turn => turn.text).join(' ');
  return {
    turns:turns.length,
    trade:vestaTrade(turns),
    firstTime:latestFact(turns, text =>
      /\b(first[- ]time (?:homeowner|home owner)|new homeowner|just bought (?:my|our) first (?:house|home))\b/i.test(text) ? true : null),
    quoteShape:latestFact(turns, text =>
      (/\b(itemized|detailed)\b/i.test(text) && /\b(one[- ]line|vague|cheaper|lower)\b/i.test(text)) ? 'uneven' : null),
    quoteCount:latestFact(turns, text => {
      const match = text.match(/\b(two|three|four|2|3|4)\s+(?:\w+\s+)?(?:quotes?|bids?|estimates?|proposals?)\b/i);
      return match ? ({ two:2, three:3, four:4 }[match[1].toLowerCase()] || Number(match[1])) : null;
    }),
    conflict:latestFact(turns, text =>
      /\b(nervous|afraid|scared|worried)\b[^.?!]{0,55}\b(difficult|ask|proof|push back|offend|walk|conflict)\b|\b(nitpick(?:y|ing)?|piss .* off|might walk|will walk|rock the boat)\b/i.test(text)
        ? true : null),
    midProject:latestFact(turns, text =>
      /\b(midway|mid-project|already started|during the job|in the middle of|work is underway)\b/i.test(text) ? true : null),
    changeOrder:latestFact(turns, text =>
      /\b(more money|extra (?:money|cost)|additional (?:work|cost)|change order|changed? the (?:price|scope)|damage means|found more)\b/i.test(text)
        ? true : null),
    verbalOnly:latestFact(turns, text =>
      /\b(only told me verbally|verbal(?:ly)?|nothing in writing|won(?:'|’)t put .* in writing)\b/i.test(text) ? true : null),
    repairDecision:latestFact(turns, text => {
      if (/\b(repairable|repair proposals?|repair quotes?)\b/i.test(text)
          && /\b(not (?:deciding|choosing)|comparing|two|three)\b/i.test(text)) return 'repair_proposals';
      if (/\b(repair or replace|replace or repair|needs? replacement|needed replacement)\b/i.test(text)) return 'repair_or_replace';
      return null;
    }),
    safety:latestFact(turns, text =>
      /\b(smell (?:of )?gas|gas smell|fire|sparking|burning outlet|active flood|flooding right now|water (?:is )?(?:pouring|gushing))\b/i.test(text) ? 'active' : null),
    combined,
    last:turns.at(-1) || null,
  };
}

const VESTA_RECAP = /\b(tell me|repeat|show me)\b[^.?!]{0,35}\b(what you (?:understand|heard|know)|your understanding)\b|\bwhat (?:do|have) you (?:understand|understood|heard)\b/i;
const VESTA_SYNTHESIS = /\b(put (?:that|it|everything) together|based on (?:that|what i (?:said|told you)|everything)|bottom line)\b|\bexact (?:next move|order|next steps?)\b|\bwhat (?:should|do) i do next\b|\bgive me (?:the )?(?:order|next steps?|plan)\b/i;

function vestaRecap(state){
  if (state.repairDecision?.value === 'repair_proposals') {
    const count = state.quoteCount?.value === 2 ? 'two ' : state.quoteCount?.value === 3 ? 'three ' : '';
    const subject = state.trade ? ` for your ${state.trade.value} system` : '';
    return `You are comparing ${count}repair proposals${subject} after a technician said the furnace is repairable. Replacement is no longer the decision. If I have any of that wrong, correct it before I advise you.`;
  }
  const facts = [];
  if (state.firstTime) facts.push('you are a first-time homeowner');
  if (state.trade) facts.push(`the work is ${state.trade.value}`);
  if (state.quoteCount) facts.push(`you have ${state.quoteCount.value} written proposals`);
  if (state.quoteShape?.value === 'uneven') facts.push('one proposal is detailed while the cheaper options are not yet comparable');
  if (state.midProject) facts.push('the work is already underway');
  if (state.changeOrder) facts.push('the contractor is asking to change the price or scope');
  if (state.conflict) facts.push('you want clarity without turning it into a fight');
  const heard = facts.length ? facts.join(', ') : 'I do not yet have enough decision facts to give you a reliable next move';
  return `Here is what I understand: ${heard}. If I have any of that wrong, correct it before I advise you.`;
}

function vestaRecommendation(state){
  if (state.midProject && state.changeOrder) {
    return 'Do this in order: ask for the changed condition in writing, with photos or other evidence; require a revised scope and the exact effect on price and schedule; then approve or reject a written change order before added work continues. That is a calm request for shared facts, not a fight. Only immediate safety protection should proceed before the change is documented.';
  }
  if (state.quoteShape?.value === 'uneven' && state.trade?.value === 'roofing') {
    const bidders = state.quoteCount?.value === 3 ? 'all three roofers' : 'each roofer';
    return `Next move: send ${bidders} the same written request for tear-off layers, deck-repair allowance, flashing, ventilation, exact material, permit responsibility, cleanup, exclusions, and workmanship warranty. Then compare equivalent scopes, not totals; the detailed bid is more legible, not automatically better. Asking for this is normal decision hygiene, not confrontation.`;
  }
  if (state.repairDecision?.value === 'repair_proposals') {
    return 'Compare the repair proposals on the same failure, exact parts and labor, what remains unaddressed, warranty, exclusions, and what finding would change the repair. Ask each firm to put those points in writing; then choose the clearer supported scope, not the shorter promise.';
  }
  return null;
}

export function vestaConversationRoute(messages){
  const state = buildVestaConversationState(messages);
  const text = state.last?.text || '';
  if (state.turns < 2 || state.safety?.value === 'active') return null;
  if (VESTA_RECAP.test(text)) return { kind:'recap', mode:'learn', say:vestaRecap(state) };
  if (VESTA_SYNTHESIS.test(text)) {
    const say = vestaRecommendation(state);
    if (say) return { kind:'synthesis', mode:'learn', say };
  }
  // A compound decision can arrive across turns: "roof quotes" first, then "one detailed,
  // two one-line"; or "mid-project" first, then a verbal price change. Once the newest turn
  // completes that state, respond to the whole situation immediately instead of letting the
  // model answer only the newest sentence or invent a new matching offer.
  if (state.quoteShape?.turn === state.last?.index && state.trade?.value === 'roofing') {
    const bidders = state.quoteCount?.value === 3 ? 'all three roofers' : 'each roofer';
    return {
      kind:'grounding',
      mode:'learn',
      say:`Those bids are not comparable yet, and asking for clarity is not being difficult. Send ${bidders} the same written request for tear-off layers, deck-repair allowance, flashing, ventilation, exact material, permit responsibility, cleanup, exclusions, and workmanship warranty. The detailed bid is more legible, not automatically better; compare equivalent scopes, not totals.`,
    };
  }
  if (state.changeOrder?.turn === state.last?.index && state.midProject) {
    return {
      kind:'grounding',
      mode:'learn',
      say:'Do not decide from a verbal “more work” claim. Ask for the changed condition in writing, photos or other evidence, a revised scope, and the exact effect on price and schedule. Then approve or reject a written change order before added work continues. That is a calm request for shared facts; only immediate safety protection should proceed sooner.',
    };
  }
  return null;
}
