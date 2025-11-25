/**
 * Table Editor Module
 * Handles creation and editing of tables in exercise descriptions
 */

/**
 * Creates a table editor interface
 * @param {string} containerId - ID of the container element
 * @param {Object} initialData - Initial table data (optional)
 * @returns {Object} Table editor instance with methods
 */
export function createTableEditor(containerId, initialData = null) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID ${containerId} not found`);
        return null;
    }

    let tableData = initialData || { rows: [['']], headers: [''] };

    const editorHTML = `
        <div class="table-editor border border-gray-300 rounded-md p-4">
            <div class="mb-3 flex gap-2">
                <button type="button" class="add-column-btn bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
                    + Spalte
                </button>
                <button type="button" class="add-row-btn bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
                    + Zeile
                </button>
                <button type="button" class="remove-column-btn bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                    - Spalte
                </button>
                <button type="button" class="remove-row-btn bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                    - Zeile
                </button>
            </div>
            <div class="table-container overflow-x-auto">
                <table class="exercise-table border-collapse w-full">
                    <thead>
                        <tr class="header-row"></tr>
                    </thead>
                    <tbody class="table-body"></tbody>
                </table>
            </div>
        </div>
    `;

    container.innerHTML = editorHTML;

    const tableElement = container.querySelector('.exercise-table');
    const headerRow = container.querySelector('.header-row');
    const tableBody = container.querySelector('.table-body');
    const addColumnBtn = container.querySelector('.add-column-btn');
    const addRowBtn = container.querySelector('.add-row-btn');
    const removeColumnBtn = container.querySelector('.remove-column-btn');
    const removeRowBtn = container.querySelector('.remove-row-btn');

    function renderTable() {
        // Render headers
        headerRow.innerHTML = '';
        tableData.headers.forEach((header, colIndex) => {
            const th = document.createElement('th');
            th.className = 'border border-gray-300 p-2 bg-gray-100';
            const input = document.createElement('input');
            input.type = 'text';
            input.value = header;
            input.placeholder = `Spalte ${colIndex + 1}`;
            input.className =
                'w-full px-2 py-1 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500';
            input.addEventListener('input', e => {
                tableData.headers[colIndex] = e.target.value;
            });
            th.appendChild(input);
            headerRow.appendChild(th);
        });

        // Render rows
        tableBody.innerHTML = '';
        tableData.rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            row.forEach((cell, colIndex) => {
                const td = document.createElement('td');
                td.className = 'border border-gray-300 p-2';
                const input = document.createElement('input');
                input.type = 'text';
                input.value = cell;
                input.placeholder = `Zeile ${rowIndex + 1}, Spalte ${colIndex + 1}`;
                input.className =
                    'w-full px-2 py-1 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-500';
                input.addEventListener('input', e => {
                    tableData.rows[rowIndex][colIndex] = e.target.value;
                });
                td.appendChild(input);
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });
    }

    function addColumn() {
        tableData.headers.push('');
        tableData.rows.forEach(row => row.push(''));
        renderTable();
    }

    function addRow() {
        const newRow = new Array(tableData.headers.length).fill('');
        tableData.rows.push(newRow);
        renderTable();
    }

    function removeColumn() {
        if (tableData.headers.length <= 1) {
            alert('Eine Tabelle muss mindestens eine Spalte haben.');
            return;
        }
        tableData.headers.pop();
        tableData.rows.forEach(row => row.pop());
        renderTable();
    }

    function removeRow() {
        if (tableData.rows.length <= 1) {
            alert('Eine Tabelle muss mindestens eine Zeile haben.');
            return;
        }
        tableData.rows.pop();
        renderTable();
    }

    addColumnBtn.addEventListener('click', addColumn);
    addRowBtn.addEventListener('click', addRow);
    removeColumnBtn.addEventListener('click', removeColumn);
    removeRowBtn.addEventListener('click', removeRow);

    renderTable();

    return {
        getData: () => tableData,
        setData: data => {
            tableData = data;
            renderTable();
        },
        clear: () => {
            tableData = { rows: [['']], headers: [''] };
            renderTable();
        },
    };
}

/**
 * Renders a table from data for display (read-only)
 * @param {Object} tableData - Table data object with headers and rows
 * @returns {string} HTML string of the rendered table
 */
export function renderTableForDisplay(tableData) {
    if (!tableData || !tableData.headers || !tableData.rows) {
        return '';
    }

    let html = '<table class="exercise-display-table border-collapse w-full my-3">';

    // Headers
    html += '<thead><tr>';
    tableData.headers.forEach(header => {
        html += `<th class="border border-gray-400 bg-gray-100 px-3 py-2 font-semibold text-left">${escapeHtml(header)}</th>`;
    });
    html += '</tr></thead>';

    // Rows
    html += '<tbody>';
    tableData.rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td class="border border-gray-300 px-3 py-2">${escapeHtml(cell)}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Sets up the description editor with text and table toggle
 * @param {Object} config - Configuration object
 * @param {string} config.textAreaId - ID of the textarea element
 * @param {string} config.toggleContainerId - ID of the toggle container
 * @param {string} config.tableEditorContainerId - ID of the table editor container
 * @param {Object} config.initialData - Initial data (optional)
 * @returns {Object} Editor instance with methods
 */
export function setupDescriptionEditor(config) {
    const { textAreaId, toggleContainerId, tableEditorContainerId, initialData = null } = config;

    const textArea = document.getElementById(textAreaId);
    const toggleContainer = document.getElementById(toggleContainerId);
    const tableEditorContainer = document.getElementById(tableEditorContainerId);

    if (!textArea || !toggleContainer || !tableEditorContainer) {
        console.error('Required elements not found for description editor');
        return null;
    }

    let currentMode = 'text'; // 'text' or 'table'
    let tableEditor = null;
    let textContent = '';
    let tableContent = null;

    // Load initial data if provided
    if (initialData) {
        if (initialData.type === 'table') {
            currentMode = 'table';
            tableContent = initialData.tableData;
            textContent = initialData.additionalText || '';
        } else {
            currentMode = 'text';
            textContent = initialData.text || '';
        }
    }

    // Create toggle UI
    toggleContainer.innerHTML = `
        <div class="mb-3">
            <label class="block text-sm font-medium text-gray-700 mb-2">Beschreibungsformat</label>
            <div class="flex gap-3">
                <button type="button" class="mode-toggle-btn text-mode px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentMode === 'text' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}">
                    📝 Nur Text
                </button>
                <button type="button" class="mode-toggle-btn table-mode px-4 py-2 rounded-md text-sm font-medium transition-colors ${currentMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}">
                    📊 Tabelle + Text
                </button>
            </div>
        </div>
    `;

    const textModeBtn = toggleContainer.querySelector('.text-mode');
    const tableModeBtn = toggleContainer.querySelector('.table-mode');

    function switchMode(mode) {
        currentMode = mode;

        if (mode === 'text') {
            textModeBtn.className =
                'mode-toggle-btn text-mode px-4 py-2 rounded-md text-sm font-medium transition-colors bg-indigo-600 text-white';
            tableModeBtn.className =
                'mode-toggle-btn table-mode px-4 py-2 rounded-md text-sm font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300';
            textArea.style.display = 'block';
            tableEditorContainer.style.display = 'none';
            textArea.value = textContent;
        } else {
            textModeBtn.className =
                'mode-toggle-btn text-mode px-4 py-2 rounded-md text-sm font-medium transition-colors bg-gray-200 text-gray-700 hover:bg-gray-300';
            tableModeBtn.className =
                'mode-toggle-btn table-mode px-4 py-2 rounded-md text-sm font-medium transition-colors bg-indigo-600 text-white';
            textArea.style.display = 'none';
            tableEditorContainer.style.display = 'block';

            // Create table editor container structure
            tableEditorContainer.innerHTML = `
                <div class="space-y-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Tabelle</label>
                        <div id="${tableEditorContainerId}-table"></div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Zusätzlicher Text (optional)</label>
                        <textarea id="${tableEditorContainerId}-additional-text" rows="3" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="Zusätzliche Informationen...">${textContent}</textarea>
                    </div>
                </div>
            `;

            tableEditor = createTableEditor(`${tableEditorContainerId}-table`, tableContent);

            const additionalTextArea = document.getElementById(
                `${tableEditorContainerId}-additional-text`
            );
            additionalTextArea.addEventListener('input', e => {
                textContent = e.target.value;
            });
        }
    }

    textModeBtn.addEventListener('click', () => {
        textContent = textArea.value;
        switchMode('text');
    });

    tableModeBtn.addEventListener('click', () => {
        textContent = textArea.value;
        switchMode('table');
    });

    // Initialize with current mode
    switchMode(currentMode);

    return {
        getContent: () => {
            if (currentMode === 'text') {
                return {
                    type: 'text',
                    text: textArea.value,
                };
            } else {
                return {
                    type: 'table',
                    tableData: tableEditor
                        ? tableEditor.getData()
                        : { rows: [['']], headers: [''] },
                    additionalText: textContent,
                };
            }
        },
        setContent: data => {
            if (data.type === 'table') {
                tableContent = data.tableData;
                textContent = data.additionalText || '';
                switchMode('table');
            } else {
                textContent = data.text || '';
                switchMode('text');
            }
        },
        clear: () => {
            textContent = '';
            tableContent = null;
            textArea.value = '';
            if (tableEditor) {
                tableEditor.clear();
            }
            switchMode('text');
        },
    };
}
