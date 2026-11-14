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

   Resultado: `output/rpforge-texture-studio-1.1.0-marketplace.ccx`. O pacote do site continua com
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
RPForge Texture Studio opens the textures of GTA V vehicles, clothing, hair and props, and of any OBJ model, in Photoshop with the UV guide on top. It shows your painting on the model in 3D while you work and saves it back to the right file, compressed and with mipmaps.

• Vehicles (.yft), clothing and hair (.ydd), props (.ydr) and any .obj model.
• Finds the matching .ytd by itself and lists the liveries first on vehicles.
• Opens a document with a locked UV wireframe, plus optional shading and normal map overlays.
• Live 3D preview panel: follows the Photoshop history, so the paint shows on the model before saving.
• Saves to the .ytd as DXT1, DXT5, BC7, uncompressed or the original format, with mipmaps; OBJ textures are saved to their own image. The UV guide is never saved.
• Keeps a backup of the original file on the first save of each session.
• Reopen the PSD later and the panel relinks it to the model automatically.

Everything runs inside the panel with RPForge's own engine: no server, no account, no data collection. Your files never leave your computer.

Works with GTA V Legacy files (FiveM). GTA V Enhanced (gen9) files are not supported yet.
```

## Passo 4 — Aba Localizations (português do Brasil)

**Subtitle**: `Pinte texturas do GTA V`

**Description**:

```
O RPForge Texture Studio abre no Photoshop as texturas de veículos, roupas, cabelos e props do GTA V, e de qualquer modelo OBJ, com o guia de UV por cima. Mostra a pintura no modelo em 3D enquanto você trabalha e salva de volta no arquivo certo, já comprimida e com mipmaps.

• Veículos (.yft), roupas e cabelos (.ydd), props (.ydr) e qualquer modelo .obj.
• Acha sozinho o .ytd correspondente e, nos veículos, lista as liveries primeiro.
• Abre um documento com o guia de UV travado e, se quiser, camadas de sombreado e mapa normal.
• Prévia 3D ao vivo: acompanha o histórico do Photoshop, então a pintura aparece no modelo antes de salvar.
• Salva no .ytd em DXT1, DXT5, BC7, sem compressão ou no formato original, com mipmaps; no OBJ, na própria imagem. O guia nunca é salvo.
• Guarda uma cópia do arquivo original no primeiro salvamento da sessão.
• Reabra o PSD outro dia e o painel religa ao modelo sozinho.

Tudo roda dentro do painel com o motor próprio do RPForge: sem servidor, sem conta, sem coleta de dados. Seus arquivos não saem do computador.

Funciona com arquivos do GTA V Legacy (FiveM). Arquivos do GTA V Enhanced (gen9) ainda não são suportados.
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

## Passo 7 — Versão 1.1.0

- **Package**: `output/rpforge-texture-studio-1.1.0-marketplace.ccx` (o do Passo 2, nunca o do site).
- **Supported languages**: English, Portuguese (Brazil).
- **Release notes (1.000)**:

```
First public release: texture panel with UV guide, live 3D preview panel, save to YTD (DXT1/DXT5/BC7) and to OBJ images, support for YFT, YDD, YDR and OBJ, PSD relinking.
```

- **Note to reviewers (1.000)**:

```
The plugin edits GTA V texture dictionaries (.ytd) and OBJ textures for modding. It needs localFileSystem fullAccess because, after the user picks a model, it must (1) find the texture files with the same name in the same folder, (2) write a backup copy next to the original before saving, and (3) reopen those files when the user reopens a PSD later (paths stored in the document XMP). All processing is local; the plugin makes no network requests. To test: Plugins > RPForge Texture Studio, Open model, pick the sample .yft from the attached ZIP, open a livery, paint, Save to YTD. The same flow works with the sample .ydd and .obj.
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
