export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, business, email, industry, challenge } = req.body;

  const slackWebhook = process.env.SLACK_WEBHOOK_NEW_LEAD;

  if (!slackWebhook) {
    console.error('Missing SLACK_WEBHOOK_NEW_LEAD');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const slackPayload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔥 New Lead — 4THWALL', emoji: true }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Name*\n${name || 'N/A'}` },
          { type: 'mrkdwn', text: `*Business*\n${business || 'N/A'}` },
          { type: 'mrkdwn', text: `*Email*\n${email || 'N/A'}` },
          { type: 'mrkdwn', text: `*Industry*\n${industry || 'N/A'}` }
        ]
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Challenge*\n${challenge || 'N/A'}` }
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'Source: 4thwall.solutions · Respond fast — this person is warm.' }
        ]
      }
    ]
  };

  try {
    const slackRes = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload)
    });

    if (!slackRes.ok) {
      const err = await slackRes.text();
      console.error('Slack webhook error:', err);
      return res.status(502).json({ error: 'Failed to send notification' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error sending to Slack:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
