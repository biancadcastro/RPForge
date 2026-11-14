# Texture Studio na Adobe Marketplace — rascunho da ficha

Rascunho de 14/11/2026, para aprovação. Requisitos levantados na documentação oficial da Adobe
(developer.adobe.com/uxp/guides/how-to/distribution/ e developer.adobe.com/developer-distribution/).

## O que só a Bianca pode fazer

1. **Perfil de publicador** no Adobe Developer Distribution: nome público, site, descrição, logo
   250×250 (usar `design/identidade/Final`) e os dados de "trader" exigidos pela lei europeia (DSA).
   Sem eles a ficha fica oculta na UE. Depois de aprovado, o perfil só pode ser editado uma vez.
2. **Criar a ficha** (Create New Listing → Creative Cloud desktop plugin → Photoshop). O portal
   gera um **ID de plugin**: me passe esse ID para eu gerar o pacote da Marketplace.
3. **Capturas no Photoshop real**, 1360×800 PNG (1 obrigatória, até 5). Sugestão:
   1. Livery aberta com o guia de UV e a prévia 3D ao lado.
   2. Lista de texturas de um veículo.
   3. Roupa (`.ydd`) aberta.
   4. Janela de salvar com a escolha de formato.
   5. Prévia 3D flutuando com "Marcar ponto".
4. Enviar e acompanhar a revisão (a Adobe tenta responder em até 10 dias úteis).

## Dois pacotes, dois IDs

A Adobe exige o ID gerado pelo portal no `.ccx` da Marketplace e recomenda **não** usar esse ID no
pacote baixado de fora. Então:

| Pacote | ID | Onde |
| --- | --- | --- |
| Site | `dev.rpforge.texturestudio` (atual) | rpforge.dev/photoshop/ |
| Marketplace | ID do portal | enviado na ficha |

`RPFORGE_MARKETPLACE_ID=<id do portal> node scripts/build-texture-studio.mjs` gera também
`output/rpforge-texture-studio-<versão>-marketplace.ccx`.

O `.ccx` é montado pelo próprio script (zip), não pelo "Package" do UXP Developer Tool. Antes de
publicar, confirmar que ele instala com dois cliques no Creative Cloud; se a Adobe recusar o pacote,
gerar o da Marketplace pelo UDT (••• → Package) a partir de `output/texture-studio-plugin-marketplace/`.

## Ajustes no plugin antes de enviar

- Conferir que não há DevTools nem logs de depuração expostos (motivo de rejeição).
- Ícones próprios em todos os temas e escalas: já existem.
- Nome do manifest em ASCII: "RPForge Texture Studio" já serve.
- Testar numa instalação limpa (instalando o `.ccx`, não pelo UXP Developer Tool).
- `localFileSystem: "fullAccess"` continua: o painel acha sozinho o `.ytd` ao lado do modelo,
  grava a cópia de segurança e religa o PSD pelos caminhos salvos, o que o seletor de arquivos
  (`request`) não permite. Não há campo de justificativa; a explicação vai na nota aos revisores.

## Ficha (campos e limites da Adobe)

**Nome público** (45): `RPForge Texture Studio`

**Subtítulo** (30)
- EN: `Paint GTA V textures in place` (29)
- PT-BR: `Pinte texturas do GTA V` (23)

**Modelo**: Free. **Idiomas**: português (Brasil) e inglês. **Categoria**: a escolher no formulário
(a lista documentada parece herdada do XD; o mais próximo é "Tools & Automation").

**Tags** (300): `GTA V, FiveM, YTD, YFT, YDD, livery, texture, UV, 3D preview, modding, DDS, BC7`

**Descrição** (5.000), EN:

> RPForge Texture Studio opens the textures of a GTA V model in Photoshop with the UV guide on top,
> shows your painting on the model in 3D while you work, and saves it back to the right file —
> compressed and with mipmaps.
>
> • Vehicles (.yft), clothing and hair (.ydd), props (.ydr) and any .obj model.
> • Finds the matching .ytd by itself and lists the liveries first.
> • Opens a document with a locked UV wireframe, plus optional shading and normal map overlays.
> • Live 3D preview panel: follows the Photoshop history, so the paint shows on the model before saving.
> • Saves as DXT1, DXT5, BC7, uncompressed or the original format, with mipmaps. The UV guide is never saved.
> • Keeps a backup of the original .ytd on the first save of each session.
> • Reopen the PSD later and the panel relinks it to the model automatically.
>
> Everything runs inside the panel with RPForge's own engine: no server, no account, no data
> collection. Your files never leave your computer.
>
> Works with GTA V Legacy files (FiveM). GTA V Enhanced (gen9) files are not supported yet.

**Descrição**, PT-BR:

> O RPForge Texture Studio abre as texturas de um modelo do GTA V no Photoshop com o guia de UV por
> cima, mostra a pintura no modelo em 3D enquanto você trabalha e salva de volta no arquivo certo,
> já comprimida e com mipmaps.
>
> • Veículos (.yft), roupas e cabelos (.ydd), props (.ydr) e qualquer modelo .obj.
> • Acha sozinho o .ytd correspondente e lista as liveries primeiro.
> • Abre um documento com o guia de UV travado e, se quiser, camadas de sombreado e mapa normal.
> • Prévia 3D ao vivo: acompanha o histórico do Photoshop, então a pintura aparece no modelo antes de salvar.
> • Salva em DXT1, DXT5, BC7, sem compressão ou no formato original, com mipmaps. O guia nunca é salvo.
> • Guarda uma cópia do .ytd original no primeiro salvamento da sessão.
> • Reabra o PSD outro dia e o painel religa ao modelo sozinho.
>
> Tudo roda dentro do painel com o motor próprio do RPForge: sem servidor, sem conta, sem coleta de
> dados. Seus arquivos não saem do computador.
>
> Funciona com arquivos do GTA V Legacy (FiveM). Arquivos do GTA V Enhanced (gen9) ainda não são suportados.

**E-mail de suporte**: `suporte@rpforge.dev` (o mesmo de `lib/legal.ts` do site; confirmar que a caixa recebe).
**Help URL**: `https://rpforge.dev/photoshop/`
**Privacy Policy URL**: `https://rpforge.dev/docs/privacidade/` (seção "No plugin para Photoshop")
**Terms of Service URL**: `https://rpforge.dev/docs/termos/` (seção "Plugin RPForge Texture Studio para Photoshop")

**Notas da versão 1.1.0** (1.000):

> First public release: texture panel with UV guide, live 3D preview panel, save to YTD (DXT1/DXT5/BC7),
> support for YFT, YDD, YDR and OBJ, PSD relinking.

**Nota aos revisores** (1.000):

> The plugin edits texture dictionaries (.ytd) of GTA V models for modding. It needs
> localFileSystem fullAccess because, after the user picks a model, it must (1) find the texture
> dictionary with the same name in the same folder, (2) write a backup copy next to it before saving,
> and (3) reopen those files when the user reopens a PSD later (paths stored in the document XMP).
> All processing is local; the plugin makes no network requests. To test: Plugins > RPForge Texture
> Studio > Open vehicle, pick the sample .yft in the attached ZIP, open a livery, paint, Save to YTD.

Falta: anexar um ZIP de exemplo para o revisor (um veículo próprio da RedHorn, sem conteúdo de terceiros).
