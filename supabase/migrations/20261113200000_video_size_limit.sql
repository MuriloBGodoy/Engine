-- Teto do vídeo: 50 MB -> 120 MB (13/11/2026)
--
-- O app promete um corte de até 60 segundos. Um vídeo de 60 s gravado em
-- 1080p por celular Android sai entre 100 e 130 MB — ou seja, o teto de
-- 50 MB recusava quase todo vídeo que alguém filmasse do próprio carro, e a
-- mensagem que aparecia ("Vídeo maior que 50 MB. Corte no celular antes ou
-- grave em resolução menor.") pedia uma coisa que ninguém vai fazer.
-- Na prática o recurso de vídeo no post nunca funcionou fora de clipes
-- curtos: a tabela `community_goals` não tem um único post com vídeo.
--
-- 120 MB é o tamanho que faz a promessa do produto caber. Não é o conserto
-- definitivo: o certo é re-codificar o vídeo no navegador antes de subir
-- (720p, ~2,5 Mbps, o que levaria os mesmos 60 s para uns 20 MB) e subir só
-- o trecho escolhido, em vez do arquivo inteiro. Enquanto isso não existe,
-- este é o teto honesto.
--
-- Espaço: o Storage usava 39 MB de 1 GB quando isto foi escrito. O limite
-- que vai apertar primeiro não é o disco, é a banda de saída (5 GB/mês no
-- plano grátis) — um vídeo de 120 MB visto 40 vezes consome o mês inteiro.
-- Por isso a re-codificação é a próxima na fila, e não um luxo.

update storage.buckets
   set file_size_limit = 125829120 -- 120 MiB
 where id in ('videos', 'chat-media');
