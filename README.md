# Proxy Manager

Aplicação desktop para gerenciar múltiplos proxies e backends externos com interface moderna, terminal integrado e monitoramento em tempo real.

## Funcionalidades

### Gerenciamento de Proxies
- **CRUD completo**: Criar, editar, excluir e listar proxies
- **Start/Stop/Restart**: Controle direto dos processos pelo botão
- **Auto-restart**: Reinicia automaticamente se o processo falhar
- **Status em tempo real**: Running, Stopped, Error com indicadores visuais
- **Uptime display**: Tempo de execução atualizado a cada segundo

### Terminal Integrado
- **Logs em tempo real**: stdout e stderr capturados e exibidos
- **Envio de comandos**: Input direto para o stdin do processo
- **Enter vazio**: Suporte para comandos que precisam apenas de Enter
- **Auto-scroll**: Rola automaticamente para a última mensagem
- **Scroll manual**: Para quando o usuário sobe para ler logs anteriores

### Health Check
- **Monitoramento HTTP**: Verifica se o backend está respondendo
- **Timeout configurável**: Tempo limite para startup do processo
- **Status visual**: Indica se o health check passou ou falhou

### Model Listing
- **Listar modelos**: Busca modelos disponíveis via `/v1/models`
- **API Key support**: Envia Bearer token quando configurado

### Configuração
- **Working directory**: Selecionar pasta do projeto
- **Start arguments**: Argumentos de linha de comando separados
- **Environment variables**: JSON para env vars do processo
- **API Key**: Chave de API injetada como `API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- **Port/Host**: Injetados como variáveis de ambiente

### .env File Management
- **Load**: Carrega conteúdo do arquivo .env
- **Apply fields**: Preenche Port, API Key, Health Path a partir do .env
- **Save**: Salva o conteúdo do textarea no .env
- **Auto-sync**: Port, Host, API_KEY são atualizados automaticamente ao salvar

### UI/UX
- **Tema dark/light**: Alternância com persistência
- **Busca/Filtro**: Filtrar proxies por nome ou comando
- **Atalhos de teclado**: Ctrl+N (novo), Ctrl+R (refresh), Ctrl+F (buscar)
- **Ordenação alfabética**: Lista organizada automaticamente
- **Cards compactos**: Botões de ação em uma linha
- **Dialog responsivo**: Formulário compacto sem scroll excessivo

### Segurança
- **WindowsProcessJob**: Processos filhos são mortos ao fechar o app
- **Kill on exit**: `stop_all()` garante limpeza em crash ou fechamento
- **Shell injection protection**: Comandos passados via argumentos, não concatenação

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust (Tauri 2)
- **UI Components**: shadcn/ui
- **Ícones**: lucide-react
- **Notificações**: sonner (toast)
- **Persistência**: JSON file (`backends.json`)

## Setup

```bash
# Instalar dependências
pnpm install

# Rodar em desenvolvimento
pnpm tauri dev

# Compilar para produção
pnpm tauri build
```

## Localização da Config

As configurações são salvas em:
- **Windows**: `%APPDATA%/proxy-manager/backends.json`

Atualizações do app NÃO afetam as configurações salvas.

## Estrutura do Projeto

```
proxy-manager/
├── src/
│   ├── App.tsx                    # Componente raiz
│   ├── main.tsx                   # Entry point
│   ├── index.css                  # Estilos globais
│   ├── lib/
│   │   ├── api.ts                 # Cliente Tauri
│   │   └── utils.ts               # Helpers
│   ├── hooks/
│   │   └── use-proxies.ts         # Hook principal
│   └── components/
│       ├── proxy-card.tsx          # Card do proxy
│       ├── proxy-list.tsx          # Lista de proxies
│       ├── proxy-dialog.tsx        # Dialog de criação/edição
│       ├── delete-confirm-dialog.tsx
│       ├── logs-viewer.tsx         # Visualizador de logs
│       ├── terminal-input.tsx      # Input de comandos
│       ├── theme-provider.tsx
│       └── theme-toggle.tsx
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                  # Setup Tauri
│   │   ├── commands/
│   │   │   └── backends.rs         # Commands Tauri
│   │   └── services/
│   │       ├── backend_runtime.rs  # Runtime de processos
│   │       └── backend_types.rs    # Tipos de dados
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```

## Comandos

```bash
# Desenvolvimento
pnpm tauri dev

# Build de produção (gera instalador .exe)
pnpm tauri build

# Apenas frontend
pnpm dev

# TypeScript check
pnpm build
```

## Licença

MIT
