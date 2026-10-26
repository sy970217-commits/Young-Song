// 명세 ③: 추가 → 목록 맨 아래에 · 체크 → 줄이 그어지고 남은 개수 −1 · 삭제 → 목록에서 사라짐
// 완료 조건: 빈 칸은 추가 안 됨 · 체크하면 남은 개수가 바로 바뀜 · 새로고침해도 남음 · 휴대폰에서 쓸 수 있음

// 할 일 목록은 Supabase의 todos 표에 저장한다 (공개 키만 쓴다)
const SUPABASE_URL = 'https://sijsxqhlaxtlmxdkmhuk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9pOuskQ0vs7Cd5yTa5iM1g_FDr6FK3h';

let items = [];  // 표에서 읽어 온 줄들 (분류·마감일·별표는 표에 칸이 없어서 이 화면에만 있다)

// todos 표에 요청을 보낸다. 실패하면 오류를 던진다
async function api(query, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/todos' + query, {
    ...options,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...options.headers },
  });
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
    const rows = await api('?select=*&order=created_at.asc');  // 링크·이미지 칸이 아직 없어도 읽힌다
    items = rows.map((row) => ({ id: row.id, text: row.text, done: row.done, link_url: row.link_url, image_url: row.image_url }));
  } catch (error) {
    showError();
  }
  render();
}

const HIDE_KEY = 'todo-hide-done';  // 완료한 것을 숨기는 중인지 저장할 이름
let hideDone = localStorage.getItem(HIDE_KEY) === 'true';

const THEME_KEY = 'todo-dark';  // 어두운 화면을 쓰는 중인지 저장할 이름
let dark = localStorage.getItem(THEME_KEY) === 'true';

function applyTheme() {
  document.body.classList.toggle('dark', dark);
  document.querySelector('#theme').textContent = dark ? '밝은 화면' : '어두운 화면';
}

// 링크 주소를 todos 표의 link_url 칸에 적는다 (이미 있으면 수정)
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
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
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

// 이미지를 저장소에 올리고, 그 주소를 todos 표의 image_url 칸에 적는다
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
      headers: { apikey: SUPABASE_KEY, 'Content-Type': file.type },
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

async function addItem(text, category, due) {
  try {
    const rows = await api('', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ text: text, done: false }),
    });
    items.push({ id: rows[0].id, text: text, category: category, due: due, done: false });  // 목록 맨 아래에
  } catch (error) {
    showError();
  }
  render();
}

// 오늘 날짜를 '2026-10-26' 모양으로 (이 기기의 시간 기준)
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
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
  // 중요 표시한 것이 맨 위, 그 안에서 마감일 가까운 순
  const order = items.map((item) => ({ item }));
  order.sort((a, b) => {
    if (Boolean(a.item.star) !== Boolean(b.item.star)) return Boolean(b.item.star) - Boolean(a.item.star);
    if (a.item.due && b.item.due) return a.item.due < b.item.due ? -1 : a.item.due > b.item.due ? 1 : 0;  // 마감일이 가까운 순
    if (a.item.due) return -1;  // 마감일이 있는 것이 없는 것보다 위
    if (b.item.due) return 1;
    return 0;                   // 마감일이 없는 것끼리는 추가한 순서 그대로
  });
  order.forEach(({ item }) => {
    if (hideDone && item.done) return;  // 숨기는 중이면 완료한 줄은 만들지 않는다
    const li = document.createElement('li');
    if (item.done) li.classList.add('done');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.done;
    check.addEventListener('change', async () => {
      item.done = check.checked;
      render();
      try {
        await api('?id=eq.' + item.id, { method: 'PATCH', body: JSON.stringify({ done: item.done }) });
      } catch (error) {
        item.done = !item.done;  // 저장 실패하면 원래대로
        showError();
        render();
      }
    });

    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star' + (item.star ? ' on' : '');
    star.textContent = item.star ? '★' : '☆';
    star.setAttribute('aria-label', '중요 표시');
    star.setAttribute('aria-pressed', item.star ? 'true' : 'false');
    star.addEventListener('click', () => {
      item.star = !item.star;
      render();
    });

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = item.text;

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = item.category || '기타';  // 분류가 없던 옛 항목은 기타

    // 마감일이 있으면 보여 주고, 지났는데 체크 안 했으면 붉게 한다
    const dueLabel = document.createElement('span');
    if (item.due) {
      const [, month, day] = item.due.split('-');
      dueLabel.className = 'due';
      dueLabel.textContent = '~' + Number(month) + '/' + Number(day);
      if (item.due < today() && !item.done) dueLabel.classList.add('overdue');
    }

    // 링크가 있으면 주소 링크, 없으면 '링크' 버튼
    let linkPart;
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
      linkEdit = [
        smallButton('수정', '링크 수정', () => addLink(item)),
        smallButton('×', '링크 지우기', () => removeLink(item)),
      ];
    } else {
      linkPart = document.createElement('button');
      linkPart.type = 'button';
      linkPart.className = 'attach';
      linkPart.textContent = '링크';
      linkPart.addEventListener('click', () => addLink(item));
    }

    // 이미지가 없으면 '이미지' 버튼
    let imageButton = null;
    if (!item.image_url) {
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

    // 한 줄에 들어가는 것들은 main에 담고, 이미지 미리보기는 그 아래에 둔다
    const main = document.createElement('div');
    main.className = 'row-main';
    main.append(check, star, label, tag);
    if (item.due) main.append(dueLabel);
    main.append(linkPart, ...linkEdit);
    if (imageButton) main.append(imageButton);
    main.append(del);
    li.append(main);

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
      thumb.alt = item.text + ' 이미지';
      imageLink.append(thumb);
      row.append(
        imageLink,
        smallButton('바꾸기', '이미지 바꾸기', () => {
          pickingItem = item;
          picker.click();
        }),
        smallButton('×', '이미지 지우기', () => removeImage(item))
      );
      li.append(row);
    }
    list.append(li);
  });
  document.querySelector('#toggle-done').textContent = hideDone ? '완료한 것 보기' : '완료한 것 숨기기';
  // 남은 개수 = 체크하지 않은 것 (숨겨도 그대로)
  document.querySelector('#count').textContent = items.filter((item) => !item.done).length;
}

document.querySelector('#toggle-done').addEventListener('click', () => {
  hideDone = !hideDone;
  localStorage.setItem(HIDE_KEY, hideDone);
  render();
});

document.querySelector('#theme').addEventListener('click', () => {
  dark = !dark;
  localStorage.setItem(THEME_KEY, dark);
  applyTheme();
});

const button = document.querySelector('#add');
button.addEventListener('click', () => {
  const input = document.querySelector('#item');
  const text = input.value.trim();
  if (text === '') return;   // 빈 칸이면 멈춘다
  const due = document.querySelector('#due');
  addItem(text, document.querySelector('#category').value, due.value);  // 고른 분류·마감일과 함께 추가한다
  due.value = '';
  input.value = '';
  input.focus();
});

// 입력칸에서 Enter를 눌러도 추가된다
document.querySelector('#item').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) button.click();
});

applyTheme();
loadItems();
