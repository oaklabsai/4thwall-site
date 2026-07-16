import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

async function text(name) {
  return readFile(new URL(name, root), 'utf8');
}

async function demoData() {
  const source = await text('lens-demo-data.js');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'lens-demo-data.js' });
  return context.window.LENS_DEMO;
}

test('public demo is explicitly synthetic and never publishable', async () => {
  const demo = await demoData();
  assert.equal(demo.meta.simulation, true);
  assert.equal(demo.meta.publishable, false);
  assert.equal(demo.meta.contract, 'dual-source-trust-story-v1');
  assert.match(demo.globalLimitation, /not a quality score/i);
});

test('every homeowner answer carries sources and a limitation', async () => {
  const demo = await demoData();
  assert.equal(demo.homeownerAnswers.length, 4);
  for (const answer of demo.homeownerAnswers) {
    assert.ok(answer.question.length > 10);
    assert.ok(answer.answer.length > 20);
    assert.ok(answer.sources.length > 0);
    assert.ok(answer.limitation.length > 20);
  }
});

test('provider and operated evidence remain separate lanes', async () => {
  const demo = await demoData();
  assert.deepEqual(Array.from(demo.sources, (source) => source.lane), [
    'Provider-recorded history',
    '4THWALL-operated record',
  ]);
  const page = await text('lens.html');
  assert.match(page, /Never blurred/);
  assert.match(page, /never merged into one mystery score/);
});

test('contractor review states fail out of the preview by default', async () => {
  const demo = await demoData();
  const held = demo.records.filter((record) => record.status !== 'visible');
  assert.ok(held.length > 0);
  assert.ok(held.every((record) => record.status === 'private' || record.status === 'questioned'));
  const workspace = await text('workspace.js');
  assert.match(workspace, /Keep private/);
  assert.match(workspace, /Question source record/);
});

test('workspace and auth routes are non-indexable while Lens is public', async () => {
  const config = JSON.parse(await text('vercel.json'));
  const rewrites = new Map(config.rewrites.map((row) => [row.source, row.destination]));
  assert.equal(rewrites.get('/lens'), '/lens.html');
  assert.equal(rewrites.get('/workspace'), '/workspace.html');
  assert.equal(rewrites.get('/workspace/signin'), '/workspace-signin.html');
  assert.equal(rewrites.get('/auth/workspace'), '/workspace-auth-callback.html');
  const workspaceHeader = config.headers.find((row) => row.source === '/workspace(.*)');
  assert.match(JSON.stringify(workspaceHeader), /noindex/);
  assert.doesNotMatch(await text('lens.html'), /name="robots" content="noindex/);
});

test('provider availability copy does not overclaim portability', async () => {
  const workspace = await text('workspace.html');
  assert.match(workspace, /Workiz[\s\S]*live semantic receipt still requires a consented provider account/i);
  assert.match(workspace, /FieldEdge[\s\S]*provider-issued access is required/i);
  assert.doesNotMatch(workspace, /Workiz[\s\S]{0,300}Connected/i);
});

test('account entry separates sign-in from provider consent', async () => {
  const signin = await text('workspace-signin.html');
  assert.match(signin, /Continue with Google/);
  assert.match(signin, /Connecting a provider is a separate, explicit consent step/);
  const onboarding = await text('workspace-onboarding.html');
  assert.match(onboarding, /No provider connected yet/);
});

test('Google sign-in is shown only when the live auth provider is enabled', async () => {
  const [signin, auth, css] = await Promise.all([text('workspace-signin.html'), text('workspace-auth.js'), text('lens.css')]);
  assert.match(signin, /id="google-signin"[^>]*hidden/);
  assert.match(auth, /\/workspace\/auth\/providers/);
  assert.match(auth, /providers\.data\.providers\.google === true/);
  assert.match(auth, /google\.hidden = false/);
  assert.match(css, /\.google-btn\[hidden\][^}]*display:none!important/);
});

test('Jobber connection requires a separate plain-language consent', async () => {
  const [workspace, script] = await Promise.all([text('workspace.html'), text('workspace.js')]);
  assert.match(workspace, /Connect your Jobber account/);
  assert.match(workspace, /Nothing becomes public/);
  assert.match(workspace, /Customer names, contact details and addresses are not kept as evidence/);
  assert.match(script, /notice_accepted: true/);
  assert.match(script, /connect-provider-data-notice-v1/);
});

test('the browser never carries Connect control or admin authority', async () => {
  const script = await text('workspace.js');
  assert.doesNotMatch(script, /CONNECT_CONTROL_SECRET|CONNECT_ADMIN_SECRET|x-4thwall-control-secret|\/control\/v1|\/admin\//i);
  assert.match(script, /\/workspace\/connections\/jobber\/start/);
  assert.match(script, /\/workspace\/connections\/handoff/);
});

test('a replayed one-use handoff reconciles against connected workspace state', async () => {
  const script = await text('workspace.js');
  const handoff = script.match(/async function consumeHandoff\(\)[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(handoff, /await api\('\/workspace\/connections'\)/);
  assert.match(handoff, /current\.ok && current\.data\.connected/);
  assert.match(handoff, /This return was already completed/);
  assert.match(handoff, /That connection return expired/);
});

test('real record decisions and homeowner answers use the private server receipt', async () => {
  const script = await text('workspace.js');
  assert.match(script, /\/workspace\/decisions/);
  assert.match(script, /accepted/);
  assert.match(script, /kept_private/);
  assert.match(script, /disputed/);
  assert.match(script, /receipt\.insights\.risk_answers/);
  assert.match(script, /publishable|non-publishable/i);
});

test('connection lifecycle actions require explicit user confirmation', async () => {
  const script = await text('workspace.js');
  assert.match(script, /window\.confirm\('Disconnect Jobber/);
  assert.match(script, /window\.prompt\('This permanently erases/);
  assert.match(script, /confirmation !== 'ERASE'/);
});

test('count-based workspace copy pluralizes correctly', async () => {
  const [workspace, script] = await Promise.all([text('workspace.html'), text('workspace.js')]);
  assert.match(workspace, /<span id="privacy-questioned-copy">record is held while its source date or state is reviewed\.<\/span>/);
  assert.match(script, /questionedHeld === 1\n\s*\? 'record is held while its source date or state is reviewed\.'\n\s*: 'records are held while their source dates or states are reviewed\.'/);
  assert.match(script, /skippedCount \+ ' unsupported source record' \+ \(skippedCount === 1 \? '' : 's'\) \+ ' skipped, never stored'/);
  assert.match(script, /Included in the private homeowner preview\. Nothing here is public\./);
  assert.match(script, /'translated record currently feeds the private homeowner preview\.'/);
  assert.match(script, /'records are stored for your workspace but excluded from the preview\.'/);
});

test('workspace readiness shows literal review state, never a composite percent', async () => {
  const script = await text('workspace.js');
  assert.doesNotMatch(script, /30 \+ \(connected \? 25 : 0\)/, 'the fake readiness percent formula must stay dead');
  assert.match(script, /reviewed \+ '\/' \+ records\.length/, 'readiness must show the literal reviewed fraction');
});
