// 하루가 지난 양도권을 지운다. Vercel이 매일 새벽에 이 주소(/api/cleanup)를 불러 준다 (vercel.json 참고)
// 비밀 키는 파일에 적지 않고 Vercel 환경 변수에서만 읽는다:
//   SUPABASE_SECRET_KEY  Supabase의 비밀 키 (sb_secret_...). 옛 이름 SUPABASE_SERVICE_ROLE_KEY도 읽는다
//   CRON_SECRET          자동 실행 암호 (Vercel이 요청에 "Bearer 암호"로 붙여 준다)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sijsxqhlaxtlmxdkmhuk.supabase.co';
const IMAGE_BUCKET = 'images';

// 한국 시간(서울)의 오늘 날짜: '2026-11-05'
function seoulToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

// 이미지 주소에서 저장소 안의 파일 이름을 꺼낸다
function imageKey(imageUrl) {
  return (imageUrl || '').split('/object/public/' + IMAGE_BUCKET + '/')[1] || null;
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) {
    res.status(503).json({ error: 'CRON_SECRET과 SUPABASE_SECRET_KEY를 Vercel 환경 변수에 넣어 주세요.' });
    return;
  }
  if (req.headers.authorization !== 'Bearer ' + secret) {
    res.status(401).json({ error: '암호가 맞지 않아요.' });
    return;
  }

  // 새 비밀 키(sb_secret_...)는 apikey 머리말로만 보내고, 옛 JWT 모양 키는 Authorization에도 붙인다
  const headers = { apikey: serviceKey, 'Content-Type': 'application/json' };
  if (!serviceKey.startsWith('sb_')) headers.Authorization = 'Bearer ' + serviceKey;
  const today = seoulToday();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // 지울 글: 상영일이 오늘보다 이전이거나, 상영일이 없는데 올린 지 24시간이 지난 글
    const query = new URLSearchParams({
      select: 'id,image_url',
      or: '(show_date.lt.' + today + ',and(show_date.is.null,created_at.lt.' + dayAgo + '))',
    });
    const found = await fetch(SUPABASE_URL + '/rest/v1/tickets?' + query, { headers });
    if (!found.ok) throw new Error('목록을 읽지 못했어요: ' + found.status);
    const rows = await found.json();

    // 글을 먼저 지우고, 그 글의 이미지 파일을 저장소에서 지운다
    let deleted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const ids = rows.slice(i, i + 100).map((row) => row.id);
      const response = await fetch(SUPABASE_URL + '/rest/v1/tickets?id=in.(' + ids.join(',') + ')', { method: 'DELETE', headers });
      if (!response.ok) throw new Error('글을 지우지 못했어요: ' + response.status);
      deleted += ids.length;
    }

    const keys = rows.map((row) => imageKey(row.image_url)).filter(Boolean);
    let images = 0;
    for (let i = 0; i < keys.length; i += 100) {
      const batch = keys.slice(i, i + 100);
      const response = await fetch(SUPABASE_URL + '/storage/v1/object/' + IMAGE_BUCKET, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ prefixes: batch }),
      });
      if (response.ok) images += (await response.json()).length;
    }

    res.status(200).json({ today: today, deleted: deleted, images: images, imagesExpected: keys.length });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
};
