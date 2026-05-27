<script>
  import { onMount } from 'svelte'
  import { marked } from 'marked'
  import DOMPurify from 'dompurify'
  import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from 'docx'
  import { saveAs } from 'file-saver'
  import { getModels, generateMeetingPrep } from '../lib/api.js'

  let models = []
  let selectedModel = ''

  let companyData = ''
  let catalogData = ''

  let generating = false
  let errorMsg = ''

  let resultMarkdown = ''
  let resultModel = ''
  let resultHtml = ''

  let llmAvailable = true
  let llmChecked = false

  $: canGenerate = companyData.trim().length > 0 && catalogData.trim().length > 0 && llmAvailable && !generating

  onMount(() => {
    loadModels()
  })

  async function loadModels() {
    try {
      const data = await getModels()
      if (Array.isArray(data)) {
        models = data.map(m => typeof m === 'string' ? { id: m, name: m } : { id: m.id ?? m, name: m.name ?? m.id ?? m })
      } else if (data?.models) {
        models = data.models.map(m => ({ id: m.id ?? m, name: m.name ?? m.id ?? m }))
      } else {
        models = []
      }
      if (models.length > 0 && !selectedModel) {
        selectedModel = models[0].id
      }
      llmAvailable = true
    } catch (e) {
      llmAvailable = false
    } finally {
      llmChecked = true
    }
  }

  async function generate() {
    errorMsg = ''
    resultMarkdown = ''
    resultModel = ''
    resultHtml = ''
    generating = true

    try {
      const result = await generateMeetingPrep({
        companyData,
        catalogData,
        model: selectedModel || undefined,
      })
      resultMarkdown = result.markdown
      resultModel = result.model
      resultHtml = DOMPurify.sanitize(marked.parse(resultMarkdown, { breaks: true }))
    } catch (e) {
      errorMsg = e?.message ?? 'Ошибка генерации плана'
    } finally {
      generating = false
    }
  }

  function exportTxt() {
    if (!resultMarkdown) return
    const blob = new Blob([resultMarkdown], { type: 'text/plain; charset=utf-8' })
    saveAs(blob, 'meeting-prep-plan.txt')
  }

  function exportHtml() {
    if (!resultMarkdown) return
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Подготовка к встрече</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:2em auto;padding:0 1em;line-height:1.7;color:#222}h1{font-size:1.4em}h2{font-size:1.2em;margin-top:1.5em}h3{font-size:1.05em}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f5f5f5}</style></head><body>' + DOMPurify.sanitize(resultHtml) + '</body></html>'
    const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
    saveAs(blob, 'meeting-prep-plan.html')
  }

  async function exportDocx() {
    if (!resultMarkdown) return

    const lines = resultMarkdown.split('\n')
    const children = []
    let i = 0

    while (i < lines.length) {
      const line = lines[i]

      if (line.startsWith('|')) {
        const tableLines = []
        while (i < lines.length && lines[i].startsWith('|')) {
          tableLines.push(lines[i])
          i++
        }
        const rows = tableLines
          .filter(l => !l.match(/^\|[\s\-:|]+\|$/))
          .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
        if (rows.length > 0) {
          const tableRows = rows.map(
            (cells, idx) =>
              new TableRow({
                tableHeader: idx === 0,
                children: cells.map(
                  cell =>
                    new TableCell({
                      width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: cell, bold: idx === 0, size: 22, font: 'Arial' })],
                          spacing: { after: 40 },
                        }),
                      ],
                    })
                ),
              })
          )
          children.push(
            new Table({
              rows: tableRows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            })
          )
        }
        continue
      }

      if (line.startsWith('### ')) {
        children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }))
      } else if (line.startsWith('## ')) {
        children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } }))
      } else if (line.startsWith('# ')) {
        children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 160 } }))
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const listContent = line.slice(2)
        const parts = listContent.split(/(\*\*.+?\*\*|\*.+?\*)/g)
        const runs = parts.filter(p => p).map(part => {
          if (part.startsWith('**') && part.endsWith('**')) return new TextRun({ text: part.slice(2, -2), bold: true, size: 22, font: 'Arial' })
          if (part.startsWith('*') && part.endsWith('*')) return new TextRun({ text: part.slice(1, -1), italics: true, size: 22, font: 'Arial' })
          return new TextRun({ text: part, size: 22, font: 'Arial' })
        })
        runs.unshift(new TextRun({ text: '\u2022 ', size: 22, font: 'Arial' }))
        children.push(new Paragraph({ children: runs, spacing: { after: 40 }, indent: { left: 360 } }))
      } else if (/^\d+\.\s/.test(line)) {
        const match = line.match(/^(\d+\.\s)/)
        const listContent = line.slice(match[0].length)
        const parts = listContent.split(/(\*\*.+?\*\*|\*.+?\*)/g)
        const runs = parts.filter(p => p).map(part => {
          if (part.startsWith('**') && part.endsWith('**')) return new TextRun({ text: part.slice(2, -2), bold: true, size: 22, font: 'Arial' })
          if (part.startsWith('*') && part.endsWith('*')) return new TextRun({ text: part.slice(1, -1), italics: true, size: 22, font: 'Arial' })
          return new TextRun({ text: part, size: 22, font: 'Arial' })
        })
        runs.unshift(new TextRun({ text: match[0], size: 22, font: 'Arial' }))
        children.push(new Paragraph({ children: runs, spacing: { after: 40 }, indent: { left: 360 } }))
      } else if (line.trim()) {
        const parts = line.split(/(\*\*.+?\*\*|\*.+?\*)/g)
        const runs = parts
          .filter(p => p)
          .map(part => {
            if (part.startsWith('**') && part.endsWith('**')) return new TextRun({ text: part.slice(2, -2), bold: true, size: 22, font: 'Arial' })
            if (part.startsWith('*') && part.endsWith('*')) return new TextRun({ text: part.slice(1, -1), italics: true, size: 22, font: 'Arial' })
            return new TextRun({ text: part, size: 22, font: 'Arial' })
          })
        children.push(new Paragraph({ children: runs, spacing: { after: 80 } }))
      }
      i++
    }

    const doc = new Document({
      sections: [{ children }],
    })
    const blob = await Packer.toBlob(doc)
    saveAs(blob, 'meeting-prep-plan.docx')
  }
</script>

<div class="prep-layout">
  {#if !llmChecked}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>Загрузка…</p>
    </div>
  {:else if !llmAvailable}
    <div class="degradation-banner">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <span>LLM не настроен. Функция подготовки к встрече недоступна.</span>
    </div>
  {:else}
    <div class="prep-header">
      <div class="prep-heading">Подготовка к встрече</div>
      <p class="prep-desc">Генерация плана подготовки к встрече с компанией на основе данных о компании и каталога продуктов</p>
    </div>

    {#if errorMsg}
      <div class="error-banner">{errorMsg}</div>
    {/if}

    <div class="input-grid">
      <div class="card">
        <h3>Данные о компании</h3>
        <p class="input-hint">Вставьте выписку, CRM-данные, результаты веб-поиска о компании</p>
        <textarea
          class="textarea"
          placeholder="ИНН, ОГРН, адрес, контакты, новости, сайт, вакансии..."
          bind:value={companyData}
          rows="14"
          disabled={generating}
        ></textarea>
        <span class="char-count">{companyData.length.toLocaleString()} символов</span>
      </div>

      <div class="card">
        <h3>Каталог продуктов</h3>
        <p class="input-hint">Вставьте описание продуктов и услуг вашей компании</p>
        <textarea
          class="textarea"
          placeholder="Список продуктов, услуг, ценовые категории..."
          bind:value={catalogData}
          rows="14"
          disabled={generating}
        ></textarea>
        <span class="char-count">{catalogData.length.toLocaleString()} символов</span>
      </div>
    </div>

    <div class="settings-bar card">
      <div class="setting-group">
        <label for="model-select">Модель</label>
        <select id="model-select" bind:value={selectedModel} disabled={generating}>
          {#each models as m}
            <option value={m.id}>{m.name}</option>
          {/each}
        </select>
      </div>

      <div class="action-group">
        <button class="btn btn-primary generate-btn" on:click={generate} disabled={!canGenerate}>
          {#if generating}
            <span class="btn-spinner"></span>
            Генерация…
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="btn-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"/></svg>
            Сгенерировать план
          {/if}
        </button>
      </div>
    </div>

    {#if resultMarkdown}
      <div class="card result-card">
        <div class="result-header">
          <h3>План подготовки</h3>
          <div class="result-meta">
            <span class="badge badge-model">{resultModel}</span>
            <div class="export-buttons">
              <button class="btn btn-sm" on:click={exportTxt}>TXT</button>
              <button class="btn btn-sm" on:click={exportDocx}>DOCX</button>
              <button class="btn btn-sm" on:click={exportHtml}>HTML</button>
            </div>
          </div>
        </div>
        <div class="result-content">
          {@html resultHtml}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .prep-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    overflow-y: auto;
    padding: 8px 0;
  }

  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    gap: 1rem;
    color: #6b7db3;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #1e2535;
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .degradation-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 2rem;
    padding: 1rem 1.25rem;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 14px;
    color: #f87171;
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .prep-header {
    margin-bottom: 0;
  }

  .prep-heading {
    font-size: 18px;
    font-weight: 600;
    color: #e8eaed;
  }

  .prep-desc {
    color: #4b5a7a;
    font-size: 0.875rem;
    margin-top: 4px;
  }

  .input-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  .card {
    background: #161b27;
    border: 1px solid #1e2535;
    border-radius: 14px;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card h3 {
    margin: 0;
    font-size: 0.9375rem;
    color: #c8d0e7;
  }

  .input-hint {
    margin: 0;
    font-size: 0.8125rem;
    color: #4b5a7a;
  }

  .textarea {
    width: 100%;
    resize: vertical;
    min-height: 200px;
    font-family: inherit;
    font-size: 0.8125rem;
    line-height: 1.6;
    background: #1e2535;
    border: 1px solid #252e42;
    border-radius: 8px;
    color: #c8d0e7;
    padding: 10px 12px;
    transition: border-color 0.15s;
  }

  .textarea:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .textarea::placeholder {
    color: #2d3a56;
  }

  .textarea:disabled {
    opacity: 0.5;
  }

  .char-count {
    display: block;
    text-align: right;
    font-size: 0.75rem;
    color: #4b5a7a;
    margin-top: 2px;
  }

  .settings-bar {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 200px;
  }

  .setting-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #4b5a7a;
  }

  .setting-group select {
    background: #1e2535;
    border: 1px solid #252e42;
    border-radius: 8px;
    color: #c8d0e7;
    padding: 8px 12px;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .setting-group select:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .setting-group select:disabled {
    opacity: 0.5;
  }

  .action-group {
    display: flex;
    align-items: flex-end;
    padding-top: 22px;
  }

  .btn {
    padding: 9px 20px;
    border-radius: 8px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-primary {
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: #fff;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .btn-sm {
    background: #1e2535;
    color: #6b7db3;
    border: 1px solid #252e42;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .btn-sm:hover {
    color: #c8d0e7;
    background: #252e42;
  }

  .generate-btn {
    min-width: 200px;
    height: 42px;
    font-size: 0.9375rem;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    display: inline-block;
  }

  .btn-icon {
    width: 18px;
    height: 18px;
    display: inline-block;
    vertical-align: middle;
  }

  .error-banner {
    padding: 10px 16px;
    background: rgba(239, 68, 68, 0.08);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 10px;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .result-card {
    animation: fadeUp 0.3s ease;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .result-header h3 {
    margin: 0;
    font-size: 0.9375rem;
  }

  .result-meta {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .export-buttons {
    display: flex;
    gap: 6px;
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .badge-model {
    background: rgba(139, 92, 246, 0.12);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .result-content {
    font-size: 0.875rem;
    line-height: 1.7;
    color: #8896b3;
  }

  .result-content :global(h1),
  .result-content :global(h2),
  .result-content :global(h3) {
    color: #c8d0e7;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
  }

  .result-content :global(h1) { font-size: 1.25rem; }
  .result-content :global(h2) { font-size: 1.0625rem; }
  .result-content :global(h3) { font-size: 0.9375rem; }

  .result-content :global(ul),
  .result-content :global(ol) {
    margin-left: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .result-content :global(p) {
    margin-bottom: 0.5rem;
  }

  .result-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.75rem 0;
    font-size: 0.8125rem;
  }

  .result-content :global(th),
  .result-content :global(td) {
    border: 1px solid #1e2535;
    padding: 6px 10px;
    text-align: left;
  }

  .result-content :global(th) {
    background: #1e2535;
    font-weight: 600;
    color: #c8d0e7;
  }

  .result-content :global(strong) {
    color: #c8d0e7;
  }

  @media (max-width: 768px) {
    .input-grid {
      grid-template-columns: 1fr;
    }

    .settings-bar {
      flex-direction: column;
    }

    .action-group {
      padding-top: 0;
    }
  }
</style>
