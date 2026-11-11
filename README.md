<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/guia-usuario/assets/logo-dark.png">
  <img src="docs/guia-usuario/assets/logo-light.png" alt="RPForge" width="360">
</picture>

### Seus pacotes de GTA V, organizados para o FiveM. 🔥

Converta RPFs, altere o spawn dos veículos e gere YTYPs pelo botão direito do Windows.

**🪟 Windows 11 · 🚗 GTA V Legacy · 📦 Versão 0.3.2 · 📜 Licença proprietária**

[🌐 Site oficial](https://rpforge.dev/) · [📥 Baixar RPForge](https://rpforge.dev/#download) · [📘 Manual online](https://rpforge.dev/docs/) · [🛠️ Suporte](https://github.com/biancadcastro/RPForge/issues)

</div>

---

## ✨ O que o RPForge faz

| Para você que quer… | O RPForge ajuda a… |
| --- | --- |
| 🚗 Adicionar um veículo ao FiveM | Extrair um RPF aberto e criar a pasta do addon com os arquivos organizados. |
| ✏️ Alterar o spawn | Atualizar o nome do veículo e as referências correspondentes. Aceita maiúsculas e minúsculas. |
| 🔧 Organizar o tuning | Colocar peças em `stream/mods` e remover opções visuais sem o modelo necessário no pacote. |
| 🗺️ Converter outros conteúdos | Preparar roupas identificadas, mapas, props, animações, texturas e tipos reconhecidos de peds, armas e áudio. |
| 🧱 Gerar YTYPs | Criar YTYPs básicos a partir de modelos `.ydr`, sem substituir os arquivos que já existem. |
| 🛡️ Conferir antes de gravar | Revisar a saída, decidir como tratar pastas existentes e preservar backups. |

Converter RPFs e gerar YTYPs funciona **sem conta, sem terminal e sem instalar Node.js separadamente**; as ferramentas de roupas (OBJ, Neon e separar pele) exigem uma conta RPForge Pro. Seus arquivos não são enviados para um servidor de conversão.

## 🖼️ Conheça o aplicativo

**Interface em desenvolvimento:** a migração para Electron + Next.js está em
`desktop-web/`, com a identidade visual do site e ações rápidas em janela compacta.
Veja [arquitetura e execução local](docs/DESKTOP_ARCHITECTURE.md). Essa mudança não
foi empacotada no instalador público descrito abaixo.

### Configure, revise e converta

![Tela Configurar do RPForge com exemplos fictícios de veículos e escolhas de destino](docs/guia-usuario/assets/02-veiculos.png)

Os nomes ficam na mesma tela. Se a pasta de saída já existir, você escolhe como continuar.

### Gere YTYPs pelo botão direito

![Resultado de uma geração de YTYP feita com um modelo de exemplo](docs/guia-usuario/assets/11-ytyp.png)

As capturas são da versão 0.3.1 e usam exemplos fictícios. O [manual oficial no site](https://rpforge.dev/docs/) acompanha cada etapa. O [PDF histórico da 0.3.1](docs/guia-usuario/Manual-RPForge-0.3.1.pdf) permanece como referência dessa edição.

## 🧭 Comece por aqui

1. Baixe e instale o RPForge pelo [site oficial](https://rpforge.dev/#download).
2. Coloque o `.rpf` em uma pasta e clique com o botão direito nela.
3. Escolha **Converter com RPForge**.
4. Em **Configurar**, mantenha os nomes ou edite o spawn.
5. Clique em **Revisar conversão**, confira o resumo e use **Converter agora**.
6. Use **Abrir resultado** e teste o addon no FiveM.

Para YTYP, reúna os `.ydr` em uma pasta e use **Gerar YTYP com RPForge**. A geração começa automaticamente.

### 📥 Instalação

- Instalador atual: [RPForge-Setup-0.3.2-x64.exe](https://github.com/biancadcastro/RPForge/releases/download/v0.3.2/RPForge-Setup-0.3.2-x64.exe).
- Pasta padrão: `%LOCALAPPDATA%\Programs\RPForge`.
- A [release 0.3.2](https://github.com/biancadcastro/RPForge/releases/tag/v0.3.2) contém somente o instalador EXE como anexo. O ZIP de código-fonte não acompanha esta versão.

**Versão de testes com certificado local:** a ativação do menu moderno pede consentimento para confiar no certificado em `TrustedPeople` para todos os usuários e confirmação de administrador. A confiança abrange outros arquivos assinados com a mesma chave. Nenhum certificado raiz é instalado. Sem autorização, o app e o menu clássico continuam disponíveis. A desinstalação não remove automaticamente essa confiança. Alertas do Windows podem continuar aparecendo; a primeira instalação em máquina limpa ainda não foi validada. Leia a [política de assinatura](https://rpforge.dev/docs/assinatura/).

## 📚 Documentação para usuários

| Guia | O que você encontra |
| --- | --- |
| [📘 Manual oficial](https://rpforge.dev/docs/) | Instalação, capturas das telas, tutoriais e dúvidas frequentes. |
| [🪟 Instalação](https://rpforge.dev/docs/instalar/) | Requisitos, confiança local e primeiros passos. |
| [📦 Conteúdos e YTYP](https://rpforge.dev/docs/conteudos/) | Tipos aceitos e limites da conversão. |
| [🛡️ Assinatura local](https://rpforge.dev/docs/assinatura/) | O que o certificado autoriza e as limitações desta versão. |

## 💾 Seus arquivos continuam com você

O RPF original permanece intacto. A análise e a revisão não criam o addon; a gravação começa em **Converter agora**.

Se uma pasta já existir, escolha **Cancelar**, **Usar outro nome** ou **Backup e substituir**. Os backups ficam ao lado da saída. O RPForge não altera seu `server.cfg` nem copia addons para a base de testes automaticamente.

## 🛠️ Precisa de ajuda?

- **O menu não apareceu?** Selecione uma única pasta com `.rpf` ou `.ydr`. Confira também **Mostrar mais opções** no Windows.
- **Nenhum arquivo foi encontrado?** Escolha a pasta que contém o arquivo. A busca não percorre subpastas do Windows.
- **O RPF foi recusado?** A versão atual aceita GTA V **Legacy**, RPF7 **OPEN/NONE**. Arquivos criptografados e GTA V Enhanced não são aceitos.
- **Converteu, mas o conteúdo não funciona no jogo?** Confira a ativação do recurso, o spawn e as dependências do servidor.

Ao abrir um relato em [Issues](https://github.com/biancadcastro/RPForge/issues), informe a versão do app, o passo em que ocorreu o problema e o texto do erro. Evite anexar conteúdo pago, dados pessoais ou um acervo inteiro.

> 💡 O tamanho em disco não é uma estimativa de FPS ou VRAM. YTYPs básicos não recriam salas e portais de MLO. Teste o resultado no FiveM antes de usar em produção.

## 📜 Licença e privacidade

A partir da **0.3.2**, o código próprio do aplicativo usa [licença proprietária](https://rpforge.dev/docs/licenca/). Esta versão de testes é gratuita. As dependências mantêm suas próprias licenças.

O código e as versões antigas já disponibilizados neste repositório continuam sob as licenças originais. O histórico público não corresponde ao código atual da versão proprietária e esta mudança não revoga os direitos já concedidos.

Consulte a [política de privacidade](https://rpforge.dev/docs/privacidade/) e os [termos de uso](https://rpforge.dev/docs/termos/). A licença do aplicativo não concede direitos sobre os mods processados.

## 💬 Suporte e sugestões

Use as [Issues](https://github.com/biancadcastro/RPForge/issues) para relatar problemas e sugerir melhorias. Para falhas sensíveis, siga a [política de segurança](SECURITY.md). Não anexe dados pessoais, credenciais ou mods de terceiros sem autorização.

---

<div align="center">

**RPForge · por Bianca de Castro** 🧡

Ferramenta independente do RedHorn Studio e do RedHorn Garage.<br>
Não afiliada à Rockstar Games ou à Cfx.re.

</div>
