# Перенос/установка стека CoPilot Sales на новую машину (Windows)

Стек из трёх проектов: **DialogScribe** (транскрипция + LLM, :7860),
**Sales Agent** (сбор карточек клиента, :8900), **CoPilot Sales** (этот фронт, Svelte+Electron, :5173).

> Без NVIDIA GPU **диаризация спикеров недоступна** (pyannote требует CUDA).
> Транскрипция (удалённый LiteLLM), LLM-анализ (GigaChat) и сбор карточек работают полностью —
> тяжёлые модели крутятся удалённо. 16 ГБ ОЗУ достаточно.

## 0. Поставить один раз
- **Git** — https://git-scm.com
- **Docker Desktop** (WSL2 backend) — для DialogScribe
- **Node.js 18+** — для этого фронта (`node -v`, `npm -v`)
- **Python 3.11** (Add to PATH) — для Sales Agent venv
- **VPN** (Koala Clash + личный Reality-профиль) — нужен для GigaChat / LiteLLM / DuckDuckGo / СБАР.
  Включить **до** запуска стека.

## 1. Клонировать репозитории
```powershell
mkdir C:\Code; cd C:\Code
git clone https://github.com/SaintDemon25/DialogScribe.git
git clone https://github.com/SaintDemon25/sales-agent.git
git clone https://github.com/SaintDemon25/copilot-sales.git
```
Нативные `.exe` захвата звука (`electron/wasapi_*.exe`) лежат в git — компилировать C++ не нужно.

## 2. Донести файлы-секреты (их НЕТ в git — перенести руками с рабочей машины)
```
DialogScribe\.env.dev   (ключи GigaChat, ASR)
sales-agent\.env        (GIGACHAT_API_KEY / SCOPE / MODEL)
copilot-sales\.env      (VITE_DS_EMAIL/PASSWORD, VITE_CALDAV_*)
```
Шаблоны полей: соответствующие `*.env.example` в каждом репозитории.
`VITE_DS_EMAIL/PASSWORD` должны совпадать с `ADMIN_EMAIL/PASSWORD` DialogScribe (по умолчанию `admin@local.dev` / `admin123`).

## 3. Собрать зависимости
```powershell
# DialogScribe — код запекается в образ
cd C:\Code\DialogScribe
docker compose -f docker-compose.dev.yaml up -d --build      # → http://localhost:7860

# Sales Agent — ОТДЕЛЬНЫЙ venv (не miniconda — там нет langchain!)
cd C:\Code\sales-agent
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt

# Front
cd C:\Code\copilot-sales
npm install
```

## 4. Запуск (порядок важен)
```powershell
# 1) DialogScribe уже поднят docker'ом. Проверка:
Invoke-RestMethod http://localhost:7860/health        # → {"status":"healthy"}

# 2) Sales Agent (:8900). reload на Windows ВЫКЛ — иначе виснет.
cd C:\Code\sales-agent
.\venv\Scripts\python.exe api_server.py --port 8900 --no-reload

# 3) Фронт + Electron (:5173)
cd C:\Code\copilot-sales
npm run electron:dev
```
Стек готов, когда: DialogScribe `/health` = healthy, Sales Agent `/health` = ok,
Vite отвечает 200 на :5173, есть окно Electron с заголовком **CoPilot Sales**.

## Подводные камни (из практики)
- **venv, а не miniconda** для Sales Agent — иначе `No module named 'langchain_core'`.
- **VPN включить заранее** — без него GigaChat / LiteLLM / СБАР отваливаются.
- **Закрытие окна Electron убивает и Vite** (`concurrently -k`) — просто `npm run electron:dev` снова.
- **Диаризация выключена** без GPU — транскрипт без разбивки по спикерам, остальное в норме.
- Демо-компании из списка встреч идут с курируемыми мок-новостями (работают без интернета),
  но СБАР по ИНН ходит в реальный API → нужна сеть/VPN.
