import {html} from "htl";
import {maybeWidth} from "./css.js";
import {stringify} from "./format.js";
import {maybeLabel} from "./label.js";
import {checkValidity, dispatchInput, preventDefault} from "./event.js";
import {createDialog} from "./dialog2.js";

function renderOptions(data, index, disabled, format) {
  if (Array.isArray(data.childs)) {
    return html`<div class="__ns__-combobox-group">
      <div class="__ns__-combobox-group-label __ns__-combobox-option">${stringify(format(data, index, data))}</div>${data.childs.map((child, i) => renderOptions(child, `${index}.${i}`, disabled, format))}</div>`;
  } else {
    return html`<div class="__ns__-combobox-option" data-value=${data.location} disabled=${typeof disabled === "function" ? disabled(index) : false}>${stringify(format(data, index, data))}</div>`;
  }
}

function resetOptionsDisplay(listContainer) {
  Array.from(listContainer.querySelectorAll('.__ns__-combobox-option')).forEach(option => {
    option.style.display = "block";
  });
  Array.from(listContainer.querySelectorAll('.__ns__-combobox-group')).forEach(group => {
    group.style.display = "block";
  });
}

function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function filterOptions(listContainer, value, threshold = 3) {
  if (value == null || value === "") {
    resetOptionsDisplay(listContainer);
    return;
  }
  value = value.toLowerCase();
  const visibleOptions = [];
  Array.from(listContainer.querySelectorAll('.__ns__-combobox-option')).forEach(option => {
    const optionText = option.textContent.toLowerCase();
    const distance = levenshteinDistance(value, optionText);
    const isVisible = distance <= threshold;
    option.style.display = isVisible ? "block" : "none";
    if (isVisible) visibleOptions.push(option);
  });
  Array.from(listContainer.querySelectorAll('.__ns__-combobox-group')).forEach(group => {
    const visibleGroupOptions = Array.from(group.querySelectorAll('.__ns__-combobox-option')).filter(option => option.style.display !== "none");
    group.style.display = visibleGroupOptions.length > 0 ? "block" : "none";
  });
  return visibleOptions;
}

async function checkAndShowDialog(input, listContainer) {
  const inputValue = input.value.trim();
  const exists = Array.from(listContainer.querySelectorAll('.__ns__-combobox-option'))
    .some(option => option.textContent.trim() === inputValue);

  if (!exists && inputValue !== "") {
    const result = await createDialog("Add New Item", [
      {id: "name", label: "Name", type: "text"},
      {id: "description", label: "Description", type: "text"},
      {id: "category", label: "Category", type: "text"}
    ], {
      width: '300px',
      height: 'auto',
      top: '30%',
      left: '50%'
    });

    if (result) {
      // 处理新添加的项目
      console.log("New item added:", result);
    }
  }
}

function createComboBox(form, input, listContainer, value, selectedValue, {
  validate = checkValidity,
  submit,
  data
} = {}) {
  submit = submit === true ? "Submit" : submit || null;
  const button = submit ? html`<button type=submit disabled>${submit}` : null;
  if (submit) input.after(button);
  input.value = stringify(selectedValue);
  value = validate(input) ? input.value : undefined;
  form.addEventListener("submit", onsubmit);
  input.oninput = oninput;
  
  function update() {
    if (validate(input)) {
      value = input.value;
      return true;
    }
  }
  
  function onsubmit(event) {
    preventDefault(event);
    if (submit) {
      if (update()) {
        button.disabled = true;
        dispatchInput(event);
      } else {
        input.reportValidity();
      }
    }
  }
  
  function oninput(event) {
    visibleOptions = filterOptions(listContainer, input.value);
    currentIndex = -1;
    highlightOption(currentIndex);
    if (listContainer.style.display === "block") {
      positionDropdown();
    }
    if (submit) {
      button.disabled = input.value === value;
      event.stopPropagation();
    } else if (!update()) {
      event.stopPropagation();
    }
  }
  
  let currentIndex = -1;
  let visibleOptions = [];

  function highlightOption(index) {
    visibleOptions.forEach((option, i) => {
      option.classList.toggle('__ns__-combobox-option-highlighted', i === index);
    });
  }

  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (currentIndex >= 0 && currentIndex < visibleOptions.length) {
        input.value = visibleOptions[currentIndex].textContent.trim();
        value = visibleOptions[currentIndex].dataset.value;
        listContainer.style.display = "none";
        resetOptionsDisplay(listContainer);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        await checkAndShowDialog(input, listContainer);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visibleOptions.length > 0) {
        currentIndex = (currentIndex + 1) % visibleOptions.length;
        highlightOption(currentIndex);
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visibleOptions.length > 0) {
        currentIndex = (currentIndex - 1 + visibleOptions.length) % visibleOptions.length;
        highlightOption(currentIndex);
      }
    }
  });

  input.addEventListener('blur', async () => {
    await checkAndShowDialog(input, listContainer);
  });

  return Object.defineProperty(form, "value", {
    get() {
      const selectedOption = Array.from(listContainer.querySelectorAll('.__ns__-combobox-option'))
        .find(opt => opt.textContent.trim() === input.value.trim());
      return selectedOption ? selectedOption.dataset.value : value;
    },
    set(v) {
      const option = Array.from(listContainer.querySelectorAll('.__ns__-combobox-option'))
        .find(opt => opt.dataset.value === v);
      if (option) {
        input.value = option.textContent.trim();
        value = v;
      } else {
        input.value = stringify(v);
        value = v;
      }
      update();
    }
  });
}

export function comboBox({
  label,
  value = "",
  placeholder,
  data = [],
  format = (d) => d,
  disabled = false,
  width,
  selectedValue,
  ...options
} = {}) {
  const input = html`<input type="text" class="__ns__-input __ns__-combobox-input" placeholder=${placeholder || "Type or select..."} disabled=${disabled === true} name="input">`;
  const listContainer = html`<div class="__ns__-combobox-list" style="display: none; position: fixed; z-index: 9999; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #ccc; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 4px;">
    ${data.map((d, i) => renderOptions(d, i, disabled, format))}
  </div>`;
  
  const form = html`<form class="__ns__ __ns__-combobox" style="${maybeWidth(width)}">
    ${maybeLabel(label, input)}
    ${input}
  </form>`;
  
  // 定位下拉列表的函数
  function positionDropdown() {
    const inputRect = input.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    
    // 使用固定定位，相对于视口
    let top = inputRect.bottom;
    const left = inputRect.left;
    const width = inputRect.width;
    
    // 检查是否有足够空间显示在下方，否则显示在上方
    const dropdownMaxHeight = 200;
    const spaceBelow = viewportHeight - inputRect.bottom;
    const spaceAbove = inputRect.top;
    
    if (spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow) {
      // 显示在输入框上方
      top = inputRect.top - Math.min(dropdownMaxHeight, spaceAbove);
      listContainer.style.maxHeight = `${Math.min(dropdownMaxHeight, spaceAbove)}px`;
    } else {
      // 显示在输入框下方
      listContainer.style.maxHeight = `${Math.min(dropdownMaxHeight, spaceBelow)}px`;
    }
    
    listContainer.style.top = `${top}px`;
    listContainer.style.left = `${left}px`;
    listContainer.style.width = `${width}px`;
  }

  // 将下拉列表添加到body，确保不受任何父容器影响
  document.body.appendChild(listContainer);

  // 添加事件监听器
  input.addEventListener("focus", () => {
    filterOptions(listContainer, input.value);
    positionDropdown();
    listContainer.style.display = "block";
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      listContainer.style.display = "none";
    }, 200);
  });

  listContainer.addEventListener("click", (event) => {
    if (event.target.classList.contains("__ns__-combobox-option")) {
      input.value = event.target.textContent.trim();
      value = event.target.dataset.value;
      listContainer.style.display = "none";
      resetOptionsDisplay(listContainer);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // 事件监听器引用，用于清理
  const resizeHandler = () => {
    if (listContainer.style.display === "block") {
      positionDropdown();
    }
  };

  const scrollHandler = () => {
    if (listContainer.style.display === "block") {
      positionDropdown();
    }
  };

  // 监听窗口大小改变和滚动事件
  window.addEventListener("resize", resizeHandler);
  window.addEventListener("scroll", scrollHandler, true); // true表示在捕获阶段监听

  // 清理函数
  const cleanup = () => {
    if (listContainer.parentNode) {
      listContainer.parentNode.removeChild(listContainer);
    }
    window.removeEventListener("resize", resizeHandler);
    window.removeEventListener("scroll", scrollHandler, true);
  };

  // 当form被移除时，清理下拉列表
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === form || node.contains && node.contains(form)) {
          cleanup();
          observer.disconnect();
        }
      });
    });
  });

  // 开始观察DOM变化
  if (form.parentNode) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  
  return createComboBox(form, input, listContainer, value, selectedValue, options);
}
