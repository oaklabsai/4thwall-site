export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, business, email, industry, challenge } = req.body;

  // Send to Telegram
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const text = [
    '🔥 *NEW LEAD — 4THWALL*',
    '',
    `*Name:* ${name || 'N/A'}`,
    `*Business:* ${business || 'N/A'}`,
    `*Email:* ${email || 'N/A'}`,
    `*Industry:* ${industry || 'N/A'}`,
    `*Challenge:* ${challenge || 'N/A'}`,
    '',
    'Respond fast — this person is warm.'
  ].join('\n');

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });

    if (!tgRes.ok) {
      const err = await tgRes.text();
      console.error('Telegram API error:', err);
      return res.status(502).json({ error: 'Failed to send notification' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error sending to Telegram:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
