// 명세: 양도권 등록 · 추가 → 목록에 생김 · 체크 → 판매 완료 · 삭제 → 목록에서 사라짐
// 완료 조건: 영화제목·가격이 비면 추가 안 됨 · 새로고침해도 남음 · 휴대폰에서 쓸 수 있음

// 양도권 목록은 Supabase의 tickets 표에 저장한다 (공개 키만 쓴다)
const SUPABASE_URL = 'https://sijsxqhlaxtlmxdkmhuk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9pOuskQ0vs7Cd5yTa5iM1g_FDr6FK3h';

let items = [];  // 표에서 읽어 온 줄들

// ---- 로그인 (Supabase Auth) ----
const SESSION_KEY = 'ticket-session';  // 로그인 정보를 이 브라우저에 저장할 이름
let session = readSession();           // 로그인 안 했으면 null

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (error) {
    return null;
  }
}

function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    user_id: data.user.id,
    email: data.user.email,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

// 로그인·가입·로그아웃 요청을 Supabase에 보낸다
async function authRequest(path, body, token) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(SUPABASE_URL + '/auth/v1' + path, { method: 'POST', headers: headers, body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error('Auth ' + response.status);
  return response.status === 204 ? null : response.json();
}

// 로그인 열쇠(토큰)가 곧 끝나면 새로 받는다. 못 받으면 로그아웃 상태가 된다
async function validToken() {
  if (!session) return null;
  if (session.expires_at - Date.now() > 60 * 1000) return session.access_token;
  try {
    saveSession(await authRequest('/token?grant_type=refresh_token', { refresh_token: session.refresh_token }));
    return session.access_token;
  } catch (error) {
    clearSession();
    applyAuth();
    return null;
  }
}

// 모든 Supabase 요청에 붙이는 머리말: 공개 키, 로그인했으면 내 열쇠도
async function authHeaders() {
  const headers = { apikey: SUPABASE_KEY };
  const token = await validToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

// 내가 쓴 글인가
function canEdit(item) {
  return Boolean(session) && item.user_id === session.user_id;
}

// tickets 표에 요청을 보낸다. 실패하면 오류를 던진다
async function api(query, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/tickets' + query, {
    ...options,
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json', ...options.headers },
  });
  if (response.status === 401) {
    clearSession();
    applyAuth();
    alert('로그인이 풀렸어요. 다시 로그인해 주세요.');
  }
  if (!response.ok) throw new Error('Supabase ' + response.status);
  return response.status === 204 ? null : response.json();
}

const IMAGE_BUCKET = 'images';          // 이미지를 올리는 Supabase 저장소 이름
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;  // 5MB

// http:// 또는 https://로 시작하는 주소만 링크로 쓴다
function isWebAddress(text) {
  return /^https?:\/\//i.test(text);
}

function showError() {
  alert('표에 저장하지 못했어요. 인터넷 연결을 확인하고 다시 해 보세요.');
}

// 페이지를 열 때 표에서 목록을 읽어 온다
async function loadItems() {
  try {
    const rows = await api('?select=*&order=created_at.asc');
    items = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      movie: row.movie,
      theater: row.theater,
      price: row.price,
      recliner: row.recliner,
      showTime: row.show_time ? row.show_time.slice(0, 5) : null,  // 19:50:00 -> 19:50
      sold: row.sold,
      star: row.star,
      link_url: row.link_url,
      image_url: row.image_url,
    }));
  } catch (error) {
    showError();
  }
  render();
}

const HIDE_KEY = 'todo-hide-done';  // 판매 완료한 것을 숨기는 중인지 저장할 이름
let hideDone = localStorage.getItem(HIDE_KEY) === 'true';

const THEME_KEY = 'todo-dark';  // 어두운 화면을 쓰는 중인지 저장할 이름
let dark = localStorage.getItem(THEME_KEY) === 'true';

function applyTheme() {
  document.body.classList.toggle('dark', dark);
  document.querySelector('#theme').textContent = dark ? '밝은 화면' : '어두운 화면';
}

// 링크 주소를 tickets 표의 link_url 칸에 적는다 (이미 있으면 수정)
async function addLink(item) {
  const address = (prompt('링크 주소를 적어 주세요 (http:// 또는 https://로 시작)', item.link_url || '') || '').trim();
  if (address === '' || address === item.link_url) return;
  if (!isWebAddress(address)) {
    alert('http:// 또는 https://로 시작하는 주소만 넣을 수 있어요.');
    return;
  }
  try {
    await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ link_url: address }) });
    item.link_url = address;
  } catch (error) {
    showError();
  }
  render();
}

// 링크를 지운다
async function removeLink(item) {
  if (!confirm('링크를 지울까요?')) return;
  try {
    await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ link_url: null }) });
    item.link_url = null;
  } catch (error) {
    showError();
  }
  render();
}

// 저장소에 있는 이미지 파일을 지운다 (표에서 주소를 뺀 뒤에 부른다)
async function deleteStoredImage(imageUrl) {
  const key = (imageUrl || '').split('/object/public/' + IMAGE_BUCKET + '/')[1];
  if (!key) return;
  try {
    const response = await fetch(SUPABASE_URL + '/storage/v1/object/' + IMAGE_BUCKET, {
      method: 'DELETE',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [key] }),
    });
    const removed = response.ok ? await response.json() : [];
    if (removed.length === 0) throw new Error('not removed');
  } catch (error) {
    alert('표에서는 지웠지만 저장소의 이미지 파일은 지우지 못했어요. Supabase의 삭제 권한을 확인해 주세요.');
  }
}

// 이미지를 지운다
async function removeImage(item) {
  if (!confirm('이미지를 지울까요?')) return;
  const oldUrl = item.image_url;
  try {
    await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ image_url: null }) });
    item.image_url = null;
  } catch (error) {
    showError();
    render();
    return;
  }
  render();
  await deleteStoredImage(oldUrl);
}

// 이미지를 저장소에 올리고, 그 주소를 tickets 표의 image_url 칸에 적는다
async function addImage(item, file) {
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 올릴 수 있어요.');
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    alert('이미지가 너무 커요. 5MB 이하만 올릴 수 있어요.');
    return;
  }
  // 저장소 이름에는 한글을 못 쓰므로 번호와 확장자만 쓴다
  const extension = (file.name.match(/\.[A-Za-z0-9]+$/) || [''])[0];
  const key = item.id + '-' + Date.now() + extension;
  try {
    const upload = await fetch(SUPABASE_URL + '/storage/v1/object/' + IMAGE_BUCKET + '/' + key, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': file.type },
      body: file,
    });
    if (!upload.ok) throw new Error('Storage ' + upload.status);
    const imageUrl = SUPABASE_URL + '/storage/v1/object/public/' + IMAGE_BUCKET + '/' + key;
    await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ image_url: imageUrl }) });
    const oldUrl = item.image_url;  // 바꾸는 경우 옛 파일은 저장소에서 지운다
    item.image_url = imageUrl;
    render();
    if (oldUrl) await deleteStoredImage(oldUrl);
    return;
  } catch (error) {
    showError();
  }
  render();
}

// 이미지 고르는 창을 여는 보이지 않는 입력칸 (화면에 붙여 둬야 휴대폰에서도 잘 열린다)
const picker = document.createElement('input');
picker.type = 'file';
picker.accept = 'image/*';
picker.hidden = true;
document.body.append(picker);
let pickingItem = null;  // 지금 이미지를 붙이려는 할 일
picker.addEventListener('change', () => {
  const file = picker.files[0];
  picker.value = '';
  if (file && pickingItem) addImage(pickingItem, file);
});

async function addItem(movie, theater, price, recliner, link, showTime) {
  try {
    const rows = await api('', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ movie: movie, theater: theater, price: price, recliner: recliner, link_url: link || null, show_time: showTime || null, sold: false, star: false }),
    });
    items.push({ id: rows[0].id, user_id: session.user_id, movie: movie, theater: theater, price: price, recliner: recliner, link_url: link || null, showTime: showTime || null, sold: false, star: false });  // 목록 맨 아래에
  } catch (error) {
    showError();
  }
  render();
}

// 줄 안에 쓰는 작은 버튼
function smallButton(text, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'attach';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', onClick);
  return button;
}

function render() {
  const list = document.querySelector('#list');
  list.innerHTML = '';
  // 중요 표시한 것이 맨 위, 같은 쪽끼리는 추가한 순서 그대로
  const order = items.map((item) => ({ item }));
  order.sort((a, b) => {
    if (Boolean(a.item.star) !== Boolean(b.item.star)) return Boolean(b.item.star) - Boolean(a.item.star);
    return 0;
  });
  order.forEach(({ item }) => {
    if (hideDone && item.sold) return;  // 숨기는 중이면 판매 완료한 줄은 만들지 않는다
    const li = document.createElement('li');
    if (item.sold) li.classList.add('done');
    const mine = canEdit(item);  // 내가 쓴 글만 고치고 지울 수 있다

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.sold;
    check.disabled = !mine;
    check.setAttribute('aria-label', '판매 완료');
    check.addEventListener('change', async () => {
      item.sold = check.checked;
      render();
      try {
        await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ sold: item.sold }) });
      } catch (error) {
        item.sold = !item.sold;  // 저장 실패하면 원래대로
        showError();
        render();
      }
    });

    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star' + (item.star ? ' on' : '');
    star.textContent = item.star ? '★' : '☆';
    star.disabled = !mine;
    star.setAttribute('aria-label', '중요 표시');
    star.setAttribute('aria-pressed', item.star ? 'true' : 'false');
    star.addEventListener('click', async () => {
      item.star = !item.star;
      render();
      try {
        await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ star: item.star }) });
      } catch (error) {
        item.star = !item.star;  // 저장 실패하면 원래대로
        showError();
        render();
      }
    });

    const label = document.createElement('span');
    label.className = 'label';
    // 영화 극장 상영시간 가격 리클라이너 순서의 한 줄 (예: 킬링타임 메가박스 제주아라 19:50 3000원 리클라이너)
    label.textContent = [
      item.movie,
      item.theater,
      item.showTime,
      Number(item.price || 0) + '원',
      item.recliner ? '리클라이너' : '',
    ].filter(Boolean).join(' ');

    // 링크가 있으면 주소 링크, 없으면 '링크' 버튼
    let linkPart = null;
    let linkEdit = [];
    if (item.link_url && isWebAddress(item.link_url)) {
      linkPart = document.createElement('a');
      linkPart.className = 'file-link';
      linkPart.href = item.link_url;
      linkPart.target = '_blank';
      linkPart.rel = 'noopener noreferrer';
      try {
        linkPart.textContent = new URL(item.link_url).hostname;
      } catch (error) {
        linkPart.textContent = '링크';
      }
      if (mine) {
        linkEdit = [
          smallButton('수정', '링크 수정', () => addLink(item)),
          smallButton('×', '링크 지우기', () => removeLink(item)),
        ];
      }
    } else if (mine) {
      linkPart = document.createElement('button');
      linkPart.type = 'button';
      linkPart.className = 'attach';
      linkPart.textContent = '링크';
      linkPart.addEventListener('click', () => addLink(item));
    }

    // 이미지가 없으면 '이미지' 버튼
    let imageButton = null;
    if (!item.image_url && mine) {
      imageButton = document.createElement('button');
      imageButton.type = 'button';
      imageButton.className = 'attach';
      imageButton.textContent = '이미지';
      imageButton.addEventListener('click', () => {
        pickingItem = item;
        picker.click();
      });
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '삭제';
    del.addEventListener('click', async () => {
      const imageUrl = item.image_url;
      try {
        await api('?id=eq.' + item.id, { method: 'DELETE' });
        items.splice(items.indexOf(item), 1);
      } catch (error) {
        showError();
        render();
        return;
      }
      render();
      if (imageUrl) await deleteStoredImage(imageUrl);  // 이미지가 있었으면 저장소에서도 지운다
    });

    // 첫 줄(main): 체크·별표·한 줄 글자·삭제. 둘째 줄(info): 링크·이미지 버튼
    const main = document.createElement('div');
    main.className = 'row-main';
    main.append(check, star, label);
    if (mine) main.append(del);

    const info = document.createElement('div');
    info.className = 'row-info';
    if (linkPart) info.append(linkPart, ...linkEdit);
    if (imageButton) info.append(imageButton);
    li.append(main);
    if (info.childElementCount) li.append(info);

    // 링크가 있는 줄은 버튼·체크·링크 글자가 아닌 곳을 누르면 링크가 새 창으로 열린다
    if (item.link_url && isWebAddress(item.link_url)) {
      li.classList.add('has-link');
      li.addEventListener('click', (event) => {
        if (event.target.closest('button, input, a')) return;
        window.open(item.link_url, '_blank', 'noopener,noreferrer');
      });
    }

    // 이미지가 있으면 줄 아래에 작은 미리보기 (누르면 크게 열린다)
    if (item.image_url && isWebAddress(item.image_url)) {
      const row = document.createElement('div');
      row.className = 'thumb-row';
      const imageLink = document.createElement('a');
      imageLink.className = 'thumb';
      imageLink.href = item.image_url;
      imageLink.target = '_blank';
      imageLink.rel = 'noopener noreferrer';
      const thumb = document.createElement('img');
      thumb.src = item.image_url;
      thumb.alt = item.movie + ' 이미지';
      imageLink.append(thumb);
      row.append(imageLink);
      if (mine) {
        row.append(
          smallButton('바꾸기', '이미지 바꾸기', () => {
            pickingItem = item;
            picker.click();
          }),
          smallButton('×', '이미지 지우기', () => removeImage(item))
        );
      }
      li.append(row);
    }
    list.append(li);
  });
  document.querySelector('#toggle-done').textContent = hideDone ? '판매 완료한 것 보기' : '판매 완료한 것 숨기기';
  // 판매 중인 개수 = 판매 완료가 아닌 것 (숨겨도 그대로)
  document.querySelector('#count').textContent = items.filter((item) => !item.sold).length;
}

document.querySelector('#toggle-done').addEventListener('click', () => {
  hideDone = !hideDone;
  localStorage.setItem(HIDE_KEY, hideDone);
  render();
});

// 로그인 상태에 따라 화면을 바꾼다 (로그인 칸 / 내 이메일·로그아웃 / 추가 입력 칸)
function applyAuth() {
  document.querySelector('#auth-out').hidden = Boolean(session);
  document.querySelector('#auth-in').hidden = !session;
  document.querySelector('#add-form').hidden = !session;
  document.querySelector('#who').textContent = session ? session.email : '';
  render();
}

function authFields() {
  return { email: document.querySelector('#email').value.trim(), password: document.querySelector('#password').value };
}

async function logIn() {
  const { email, password } = authFields();
  if (email === '' || password === '') {
    alert('이메일과 비밀번호를 적어 주세요.');
    return;
  }
  try {
    saveSession(await authRequest('/token?grant_type=password', { email: email, password: password }));
  } catch (error) {
    alert('로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요. (가입 직후라면 메일 인증이 필요할 수 있어요)');
    return;
  }
  document.querySelector('#password').value = '';
  applyAuth();
  await loadItems();
}

async function signUp() {
  const { email, password } = authFields();
  if (email === '' || password.length < 6) {
    alert('이메일을 적고, 비밀번호는 6자 이상으로 적어 주세요.');
    return;
  }
  try {
    const data = await authRequest('/signup', { email: email, password: password });
    if (data && data.access_token) {
      saveSession(data);  // 메일 인증이 꺼져 있으면 가입과 함께 로그인된다
      document.querySelector('#password').value = '';
      applyAuth();
      await loadItems();
    } else {
      alert('가입했어요. 메일로 인증 링크를 보냈으면 링크를 누른 뒤 로그인해 주세요.');
    }
  } catch (error) {
    alert('가입하지 못했어요. 이미 가입한 이메일이거나 비밀번호가 너무 짧을 수 있어요.');
  }
}

async function logOut() {
  try {
    await authRequest('/logout', {}, await validToken());
  } catch (error) {}  // 서버에 알리지 못해도 이 브라우저에서는 로그아웃한다
  clearSession();
  applyAuth();
}

document.querySelector('#login').addEventListener('click', logIn);
document.querySelector('#signup').addEventListener('click', signUp);
document.querySelector('#logout').addEventListener('click', logOut);
document.querySelector('#password').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) logIn();
});

document.querySelector('#theme').addEventListener('click', () => {
  dark = !dark;
  localStorage.setItem(THEME_KEY, dark);
  applyTheme();
});

// 가격을 500원씩 올리고 내린다 (0원 아래로는 안 내려간다, 빈 칸은 0원으로 본다)
function changePrice(amount) {
  const price = document.querySelector('#price');
  price.value = Math.max(0, (Number(price.value) || 0) + amount);
}
document.querySelector('#price-plus').addEventListener('click', () => changePrice(500));
document.querySelector('#price-minus').addEventListener('click', () => changePrice(-500));

const button = document.querySelector('#add');
button.addEventListener('click', () => {
  const movie = document.querySelector('#movie');
  const price = document.querySelector('#price');
  const showTime = document.querySelector('#show-time');
  const recliner = document.querySelector('#recliner');
  const link = document.querySelector('#link');
  const title = movie.value.trim();
  const won = Number(price.value);
  if (title === '' || price.value.trim() === '') return;      // 영화제목이나 가격이 비면 멈춘다
  if (!Number.isInteger(won) || won < 0) {                    // 가격은 0 이상의 정수만
    alert('가격은 0 이상의 숫자로 적어 주세요.');
    return;
  }
  const address = link.value.trim();
  if (address !== '' && !isWebAddress(address)) {              // 링크는 http:// 또는 https://로 시작해야 한다
    alert('링크는 http:// 또는 https://로 시작하는 주소만 넣을 수 있어요.');
    return;
  }
  addItem(title, document.querySelector('#theater').value, won, recliner.checked, address, showTime.value);
  movie.value = '';
  price.value = '';
  showTime.value = '';
  recliner.checked = false;
  link.value = '';
  movie.focus();
});

// 입력칸에서 Enter를 눌러도 추가된다
document.querySelector('#movie').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) button.click();
});

applyTheme();
applyAuth();
loadItems();
