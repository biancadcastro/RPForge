# Texture Studio na Adobe Marketplace — passo a passo

Atualizado em 14/11/2026. Tudo o que dá para preparar antes está pronto; os campos abaixo são para
copiar e colar. Arquivos de apoio em `output/adobe-marketplace/` (fora do Git).

## Links

| Para quê | Link |
| --- | --- |
| Portal (perfil, ficha, envio) | https://developer.adobe.com/distribute |
| Guia oficial de envio | https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/submission/overview |
| Campos da ficha | https://developer.adobe.com/uxp/guides/how-to/distribution/listing/ |
| Regras da revisão | https://developer.adobe.com/uxp/guides/how-to/distribution/review-guidelines/ |
| Dados de "trader" (lei europeia) | https://developer.adobe.com/compliance/ |
| Perguntas frequentes | https://developer.adobe.com/developer-distribution/creative-cloud/docs/guides/faq |

## Passo 1 — Perfil de publicador (uma vez só)

1. Abra https://developer.adobe.com/distribute e entre com a conta Adobe que vai ser a dona do plugin.
2. Vá em **Account and profile › Public profile** e preencha:

| Campo | Valor |
| --- | --- |
| Public name | `RPForge` |
| Website | `https://rpforge.dev` |
| Description | `RPForge makes free tools for GTA V modders and FiveM server creators: texture painting in Photoshop, RPF to FiveM resource conversion and more. Everything runs on your computer.` |
| Logo (250×250) | `output/adobe-marketplace/logo-publicador-250.png` |

Versão longa da descrição (a que está no portal), já corrigida pela revisão de 16/11/2026. A
regra de marca da Adobe pede **"plugin for Photoshop"**, nunca **"Photoshop plugin"** (o nome
Photoshop não pode virar adjetivo de um produto que não é da Adobe):

```
RPForge is an independent studio from Brazil that builds tools for GTA V modders and FiveM server creators. Our plugin for Photoshop, Texture Studio, lets you paint vehicle, clothing, prop and OBJ textures with the UV guide and a live 3D preview, then save straight back to the game files. Our tools run entirely on your computer: no accounts required, no data collection. RPForge is not affiliated with Rockstar Games, Take-Two Interactive or Cfx.re.
```

3. **Dados de trader (União Europeia): decidido em 14/11/2026 não distribuir na UE por ora.**
   No perfil, escolha a opção de não distribuir na UE (opt-out) em vez de preencher os dados. O
   plugin fica disponível no resto do mundo. Para incluir a UE depois, preencher e-mail comercial,
   telefone, endereço postal e a autodeclaração (ficam visíveis para quem acessa da UE) e reenviar.

## Passo 2 — Criar a ficha e pegar o ID

1. No portal: **Create New Listing › Creative Cloud desktop plugin › Photoshop**.
2. O portal gera o **ID do plugin**. Mande esse ID para o Claude, que gera o pacote da Marketplace:

   ```bash
   RPFORGE_MARKETPLACE_ID=<id> node scripts/build-texture-studio.mjs
   ```

   Resultado: `output/rpforge-texture-studio-<versão>-marketplace.ccx`. O pacote do site continua com
   `dev.rpforge.texturestudio` (a Adobe pede IDs diferentes dentro e fora da Marketplace).

## Passo 3 — Aba General

| Campo (limite) | Valor |
| --- | --- |
| Name (45) | `RPForge Texture Studio` |
| Subtitle (30) | `Paint GTA V textures in place` |
| Purchase model | Free |
| Category | a mais próxima de ferramentas (ex.: Tools & Automation) |
| Support email | `suporte@rpforge.dev` (confirmar que a caixa recebe) |
| Help URL | `https://rpforge.dev/photoshop/` |
| Privacy Policy URL | `https://rpforge.dev/docs/privacidade/` |
| Terms of Service URL | `https://rpforge.dev/docs/termos/` |

**Description (5.000)** — inglês:

```
RPForge Texture Studio opens the textures of GTA V vehicles, clothing, hair and props, and of any OBJ model, in Photoshop with the UV guide on top. A second panel shows your painting on the model in 3D as you work. When you save, the texture goes back into the original file, compressed and with mipmaps.

• Opens vehicles (.yft), clothing and hair (.ydd), props (.ydr) and .obj models.
• Finds the matching .ytd next to the model. On vehicles, liveries come first in the list.
• Creates a document with a locked UV guide layer. Shading and normal map layers are optional.
• Updates the 3D preview from the History panel in Photoshop, before you save.
• Saves to the .ytd as DXT1, DXT5, BC7, uncompressed or the original format, with mipmaps. OBJ textures are saved to their own image. The UV guide is never saved.
• Keeps a backup of the original file the first time you save in a session.
• Reconnects a saved PSD to its model when you open it again.

Everything runs inside the panel with RPForge's own engine: no server, no account, no data collection. Your files never leave your computer.

The interface follows the language set in Photoshop, in 19 languages.

Works with GTA V Legacy files, the ones FiveM uses. GTA V Enhanced (gen9) files are not supported yet.
```

## Passo 4 — Aba Localizations (português do Brasil)

**Subtitle**: `Pinte texturas do GTA V`

**Description**:

```
O RPForge Texture Studio abre no Photoshop as texturas de veículos, roupas, cabelos e props do GTA V, e de qualquer modelo OBJ, com o guia de UV por cima. Um segundo painel mostra a pintura no modelo em 3D enquanto você trabalha. Ao salvar, a textura volta para o arquivo original, comprimida e com mipmaps.

• Abre veículos (.yft), roupas e cabelos (.ydd), props (.ydr) e modelos .obj.
• Procura o .ytd correspondente na pasta do modelo. Nos veículos, as liveries aparecem primeiro.
• Cria um documento com a camada do guia de UV travada. Camadas de sombreado e mapa normal são opcionais.
• A prévia 3D acompanha o histórico do Photoshop, antes de salvar.
• Salva no .ytd em DXT1, DXT5, BC7, sem compressão ou no formato original, com mipmaps. No OBJ, salva na própria imagem. O guia de UV nunca é salvo.
• Guarda uma cópia do arquivo original no primeiro salvamento da sessão.
• Ao reabrir um PSD salvo, o painel liga o documento ao modelo de novo.

Tudo roda dentro do painel com o motor próprio do RPForge: sem servidor, sem conta, sem coleta de dados. Seus arquivos não saem do computador.

A interface segue o idioma do Photoshop, em 19 idiomas.

Funciona com arquivos do GTA V Legacy, os que o FiveM usa. Arquivos do GTA V Enhanced (gen9) ainda não são suportados.
```

## Passo 5 — Aba Media

- **Ícones**: `output/adobe-marketplace/icone-48.png`, `icone-96.png`, `icone-192.png` (bigorna oficial).
- **Capturas** (1 obrigatória, até 5; 1360×800, PNG ou JPG, menos de 5 MB). Precisam ser do
  Photoshop real. Tire do jeito que for mais fácil e mande para o Claude recortar em 1360×800:
  1. Livery de um carro aberta com o guia de UV e a prévia 3D ao lado.
  2. Roupa (`.ydd`) aberta com o guia e a prévia 3D.
  3. Um OBJ aberto com a prévia 3D.
  4. Lista de texturas de um veículo no painel.
  5. Janela de salvar com a escolha de formato (DXT1/DXT5/BC7).
- **Vídeo** (opcional): link do YouTube ou Vimeo.

## Passo 6 — Aba Tags

```
GTA V, FiveM, YTD, YFT, YDD, livery, texture, UV, 3D preview, modding, DDS, BC7
```

## Passo 7 — Versão 1.2.0 (reenvio após a recusa de 16/11/2026)

- **Package**: `output/rpforge-texture-studio-1.2.0-marketplace.ccx` (o do Passo 2, nunca o do site).
- **Supported languages**: marcar todos os que o portal oferece (English, German, French, Japanese, Korean, Spanish, Simplified Chinese, Brazilian Portuguese, Italian, Russian). O plugin também traduz para ucraniano, polonês, tcheco, turco, holandês, sueco, dinamarquês, finlandês e norueguês, que o portal não lista.
- **Release notes (1.000)**:

```
The interface now follows the language set in Photoshop (19 languages, English when the language is not one of them). New panel icons for light and dark themes. The 3D Preview button opens the preview panel. Bright paint no longer shows wrong colors in the 3D preview.
```

- **Note to reviewers (1.000)**:

```
Changes since the last review: the interface is now in English by default and follows the language set in Photoshop (19 languages); the publisher description now says "plugin for Photoshop"; the panels have their own icons with @1x and @2x files for light and dark themes. The plugin edits GTA V texture dictionaries (.ytd) and OBJ textures for modding. It needs localFileSystem fullAccess because, after the user picks a model, it must (1) find the texture files with the same name in the same folder, (2) write a backup copy next to the original before saving, and (3) reopen those files when the user reopens a PSD later (paths stored in the document XMP). It requests ipc.enablePluginCommunication only to open its own 3D Preview panel with showPanel(). All processing is local; the plugin makes no network requests. To test: Plugins > RPForge Texture Studio, Open model, pick the sample .yft from the attached ZIP, open a livery, paint, Save to YTD. The same flow works with the sample .ydd and .obj.
```

- **ZIP de exemplo para o revisor**: um veículo, uma roupa e um OBJ próprios da RedHorn (sem
  conteúdo de terceiros). Escolha os arquivos; o Claude monta o ZIP.

## Passo 8 — Enviar

**Preview and submit**: escolha publicação automática depois da aprovação (ou manual, para
anunciar junto). Chega um e-mail de confirmação; a Adobe tenta responder em até 10 dias úteis. Se
pedirem ajustes, corrigimos e reenviamos uma versão nova.

## Depois da aprovação

Em `RPForge-Site/lib/photoshop-plugin.ts`, preencher `marketplaceUrl` com o endereço da ficha e
publicar o site: o botão principal de rpforge.dev/photoshop/ vira "Instalar pelo Creative Cloud".

## Notas técnicas

- O `.ccx` é montado pelo próprio script (zip), não pelo "Package" do UXP Developer Tool. Se o portal
  recusar o pacote, gerar pelo UDT (••• → Package) a partir de `output/texture-studio-plugin-marketplace/`.
- Motivos comuns de recusa (regras da revisão): botões que não funcionam, DevTools expostas, links
  de suporte/privacidade quebrados, ícones genéricos, uso indevido da marca Adobe.
