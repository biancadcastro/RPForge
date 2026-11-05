# Roupa para Neon — conversão nativa

Disponível no app e no botão direito do YDD, sobre a pasta ou no fundo da pasta.
As ações do Explorer usam `--neon` e `--neon-folder` e abrem uma janela compacta.
Não consultam conta ou versão e não executam Blender.

## Uso e saída

Selecione a roupa e seu YTD, confira o destino e use Converter para Neon.
Não há confirmação de separação de pele no fluxo. Neon e Separar pele são
operações independentes: a conversão Neon não recorta malhas nem gera uma peça
de pele. Peças com pele reconhecida são recusadas com orientação para usar
Separar pele antes. A ferramenta de separação permanece uma implementação própria.

A verificação combina nomes protegidos, torso `uppr`, materiais conhecidos de
pele e correspondências geométricas com a referência anatômica local. O motor
recebe somente fingerprints de triângulos, sem copiar a geometria da referência.
Essa checagem é conservadora, limitada às referências e aos formatos suportados;
não constitui identificação universal de pele em modelos arbitrariamente editados.

O conversor grava uma cópia do YDD com um ID de drawable livre, diferente da
origem. O YTD selecionado é copiado byte a byte com o mesmo ID novo, preservando
os nomes internos das texturas e suas referências. Os arquivos ficam diretamente
no destino, sem sobrescrever resultados anteriores. O resultado mostra os nomes
e o caminho completo. Não modifica o acervo, não pinta a textura de branco e não
aplica logo. O escopo inicial é roupa freemode Legacy com um drawable por YDD.

## Preset e validação

O preset é o exemplar já usado no acervo RedHorn: `ped_emissive.sps`, multiplicador
emissivo 1 e Colour0 RGBA (255,185,255,0). Os samplers de difusa, normal, specular e
volume são reaproveitados do material original. Todos os LODs existentes recebem
o preset. Os canais originais são copiados byte a byte, exceto Colour0; UV1 e
tangentes são acrescentados apenas quando ausentes.

O YDD final é reaberto e rejeitado se mudar posição, normal, UV, peso, índice de
osso, índice de triângulo, rig ou textura embutida. Também são conferidos nome/hash,
shader e cor Neon. Essa validação estrutural não substitui conferir a aparência
no FiveM. Não foi realizada validação visual no jogo nesta implementação.

`ClothingNeon.exe` usa CodeWalker.Core e SharpDX no mesmo motor local da exportação
OBJ. `neon-shader.xml` é o preset, incluído no manifesto de integridade. O processo
encerra após cada operação; cancelamento e falhas removem a saída temporária.

## Verificação real

`scripts/check-neon-real.mjs` recebe o mesmo JSON externo de peças usado nos testes
OBJ. Foram usadas a Camisa #003 masculina e a Camisa #001 feminina do acervo:
LOD alto, respectivamente 1.993/988 vértices e 2.656/1.462 triângulos. Os LODs
médio e baixo também foram preservados. O teste verifica hashes dos originais,
cópia exata do YTD, IDs distintos em conversões repetidas e cancelamento sem sobras.

`desktop-web/scripts/check-neon.mjs` valida as duas peças reais pela janela
compacta, ausência de confirmação de pele, conta não consultada e encerramento do worker.
Os dados reais são copiados para diretórios temporários antes de chegar ao app
ou ao motor. Os scripts aceitam saídas somente sob `output/` ou em diretório
temporário e recusam redirecionamentos. O modo de teste do Electron recusa peças
fora dessas áreas. Não se deixam janelas de teste apontadas para o acervo.
Somente os diálogos de escolha de destino são automatizados; os resultados não
são simulados. Os modelos privados e evidências ficam fora do Git.
