const STORAGE_KEY = "shopping-items";

const input = document.getElementById("item");
const addButton = document.getElementById("add");
const list = document.getElementById("list");
const count = document.getElementById("count");

// 저장된 목록이 있으면 그것을, 없으면 화면에 처음부터 있던 목록을 쓴다
function loadItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return Array.from(list.querySelectorAll("li")).map((li) => ({
    text: li.textContent.replace("삭제", "").trim(),
    done: false,
  }));
}

function saveItems() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {}
}

let items = loadItems();

function render() {
  list.textContent = "";
  items.forEach((item, index) => {
    const li = document.createElement("li");
    if (item.done) li.className = "done";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.done;
    checkbox.addEventListener("change", () => {
      item.done = checkbox.checked;
      saveItems();
      render();
    });

    const text = document.createElement("span");
    text.textContent = item.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => {
      items.splice(index, 1);
      saveItems();
      render();
    });

    li.append(checkbox, text, deleteButton);
    list.appendChild(li);
  });

  // 남은 개수 = 체크 안 한 것
  count.textContent = items.filter((item) => !item.done).length;
}

addButton.addEventListener("click", () => {
  const text = input.value.trim();
  if (text === "") return; // 빈 칸은 추가하지 않는다
  items.push({ text, done: false });
  input.value = "";
  saveItems();
  render();
});

render();
