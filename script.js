// 명세 ③: 추가 → 목록 맨 아래에 · 체크 → 줄이 그어지고 남은 개수 −1 · 삭제 → 목록에서 사라짐
// 완료 조건: 빈 칸은 추가 안 됨 · 체크하면 남은 개수가 바로 바뀜 · 새로고침해도 남음 · 휴대폰에서 쓸 수 있음

const KEY = 'todo-items';  // 이 브라우저 안(로컬 스토리지)에 저장할 이름
let items = JSON.parse(localStorage.getItem(KEY) || '[]');

const HIDE_KEY = 'todo-hide-done';  // 완료한 것을 숨기는 중인지 저장할 이름
let hideDone = localStorage.getItem(HIDE_KEY) === 'true';

function save() {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function addItem(text, category, due) {
  items.push({ text: text, category: category, due: due, done: false });  // 목록 맨 아래에
  save();
  render();
}

// 오늘 날짜를 '2026-10-26' 모양으로 (이 기기의 시간 기준)
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

function render() {
  const list = document.querySelector('#list');
  list.innerHTML = '';
  items.forEach((item, i) => {
    if (hideDone && item.done) return;  // 숨기는 중이면 완료한 줄은 만들지 않는다
    const li = document.createElement('li');
    if (item.done) li.classList.add('done');

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = item.done;
    check.addEventListener('change', () => {
      items[i].done = check.checked;
      save();
      render();
    });

    const label = document.createElement('span');
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

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '삭제';
    del.addEventListener('click', () => {
      items.splice(i, 1);
      save();
      render();
    });

    li.append(check, label, tag);
    if (item.due) li.append(dueLabel);
    li.append(del);
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

render();
