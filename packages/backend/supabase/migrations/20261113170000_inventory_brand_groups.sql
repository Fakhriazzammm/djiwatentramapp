-- Grup bahan + baris per merek (minyak goreng, margarin, gula, bumbu, sirup, kecap).
-- Sumber: reports/inventaris-merek-2026 (audit_merek.py).
--
-- Aditif: tidak menghapus baris, tidak mengubah quantity/riwayat. Yang dilakukan:
--   1. menambah kolom ingredient_group dan mengisinya;
--   2. mengisi default_brand_name pada baris yang sudah berupa satu merek;
--   3. membuat 15 baris merek baru (quantity 0) untuk merek yang sebelumnya
--      tercampur di baris generik;
--   4. memindahkan alias merek dari baris generik ke baris merek yang benar;
--   5. mencatat audit dan menyediakan view perbandingan harga.

BEGIN;

SELECT set_config('yumi.allow_manual_material_create', 'on', true);
SELECT set_config('yumi.allow_inventory_catalog_write', 'on', true);

-- 0. Jalur migrasi katalog pada guard mode stok manual -------------------
CREATE OR REPLACE FUNCTION pos.guard_manual_stock_inventory_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pos', 'public', 'pg_catalog'
AS $function$
BEGIN
  IF current_setting('yumi.allow_inventory_catalog_write', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF pos.current_inventory_stock_mode() = 'manual' THEN
    IF TG_OP = 'INSERT' AND current_setting('yumi.allow_manual_material_create', true) = 'on' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Mode stok manual aktif: gunakan halaman Stok Manual untuk memperbarui bahan.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1. Snapshot + kolom grup ------------------------------------------------
CREATE TABLE IF NOT EXISTS pos.inventory_brandgroup_snapshot AS
SELECT i.*, now() AS snapshot_at FROM pos.inventory i;

ALTER TABLE pos.inventory ADD COLUMN IF NOT EXISTS ingredient_group text;
CREATE INDEX IF NOT EXISTS inventory_ingredient_group_idx
  ON pos.inventory (ingredient_group);

-- 2. Isi grup bahan -------------------------------------------------------
WITH g(source_id, grup, merek) AS (
  VALUES
    ('inv_nov26_effdcf90a930077c73be6754', 'Cabe Besar', NULLIF('', '')),
    ('inv_nov26_8cf83f22c7a26f0afcad0479', 'Caisim', NULLIF('', '')),
    ('inv_nov26_c1f62146d15fca0d4c56ca86', 'Cumi', NULLIF('', '')),
    ('inv_nov26_9086ae727e82a3b72dac9163', 'Susu UHT', NULLIF('Cimory', '')),
    ('inv_nov26_7b36f6203b90541f1e333644', 'Kikil Sapi', NULLIF('', '')),
    ('inv_nov26_73b180aafc233cfe97be8619', 'Tempe', NULLIF('', '')),
    ('inv_a43d80a18f754507', 'Keju Cheddar', NULLIF('', '')),
    ('kd73h78n14zhg1m5108f9tgzhh84vz2e', 'Merica', NULLIF('Ladaku', '')),
    ('labx0ny0x401n0x9n3b8afwaw97bxmoa', 'Bumbu Instan', NULLIF('Kunci Mas', '')),
    ('kd7d50snetkdtejs8t06b1f4j1841csr', 'Bawang Daun', NULLIF('', '')),
    ('kd783rwhwyea761sm9hhame9m5850jhb', 'Bumbu Instan', NULLIF('', '')),
    ('kd782vvwq6br3c2h95z00we82s841kav', 'Cabe Domba', NULLIF('', '')),
    ('kd73n2tk29rd82qrzy2g90ybhn84gn62', 'Cabe Kering', NULLIF('', '')),
    ('kd768nbfaqw316mjk7m8rtbzm9841rdz', 'Cabe Keriting', NULLIF('', '')),
    ('kd756apeba36bxafk7gwhzt4j984twen', 'Saus Nasi Goreng', NULLIF('', '')),
    ('kd70g41p9es1nn92t7c18p2n7s84f16p', 'Cireng', NULLIF('', '')),
    ('kd731tg6wwds7k2vex8rakq8hn840sak', 'Krim Masak', NULLIF('Gold Label', '')),
    ('67abhjqffzgguq6hwoyzh2scxlpizlby', 'Daun Surawung', NULLIF('', '')),
    ('inv_6fed41a986984d9381873433', 'Saus Cabe', NULLIF('Del Monte', '')),
    ('kd71qn66ncagh4zqdeppnmgwss84nj71', 'Kentang Beku', NULLIF('Idaho', '')),
    ('inv_oct26_5c70e9125a956b27c5ae3cc4', 'Susu UHT', NULLIF('Diamond', '')),
    ('kd72bmg41w30a30r6kqzgte3b984epm3', 'Susu Kelapa', NULLIF('', '')),
    ('inv_6a31f65ece7b4e1d87b777f9', 'Ongkir', NULLIF('', '')),
    ('kd7akay2p2wegwybyxyqezvcz184dwam', 'Es Batu', NULLIF('', '')),
    ('kd7d121f1j7gsr30td50e1kfp5840c97', 'Garam', NULLIF('', '')),
    ('kd70jrsyzmdej1ttscdq6fnj55841xks', 'Biji Wijen', NULLIF('', '')),
    ('kd79s2azxe81jkbqs4b4v97afs8413f6', 'Jeruk Limau', NULLIF('', '')),
    ('kd77sax4xv2etkmhmbk404r48d841s2x', 'Kecap Asin', NULLIF('ABC', '')),
    ('kd78cey7pbjht8xa1g1v01qyt584t8sk', 'Pasta Vanilla', NULLIF('Koepoe', '')),
    ('kd7fmjkh7f2mny2a0zct1g2dh9841ma4', 'Bawang Bombai', NULLIF('', '')),
    ('kd769amvxer1jzgrkr9m91bpq184c6jp', 'Kecap Inggris', NULLIF('SNW', '')),
    ('inv_oct26_6d59bb031fb3d648eaf9732a', 'Kemangi', NULLIF('', '')),
    ('kd74ptmty7k041zgtmphhj0x4s84hhb0', 'Kemiri', NULLIF('', '')),
    ('kd70fjzd492abvhs2sd3sea781840nmm', 'Kentang', NULLIF('', '')),
    ('kd753g7avw8vqnzmxpz84hea9x84x0tm', 'Kentang Beku', NULLIF('Idaho', '')),
    ('inv_c4b3e1ed6b45413eabdfbbb9', 'Sampah', NULLIF('', '')),
    ('kd72t6ry3ad4jts3ga606rkpvh84wfbd', 'Kemasan', NULLIF('', '')),
    ('kd76t6c63eqvwzfffbq7q3593x841c46', 'Single Origin', NULLIF('', '')),
    ('kd7fbj7zg1ewd7agz2pqzqktzs840fzb', 'Kulit Pangsit', NULLIF('Cap Jempol', '')),
    ('kd74v7evnsgkwwmf3kf78dznp1841ngs', 'Teh Lemon', NULLIF('Max Tea', '')),
    ('kd78xdsmppxpe8dsw71ztwx64584x315', 'Pencuci Piring', NULLIF('Lifebuoy', '')),
    ('kd7bp9876cq991w2kr7z4cxhxd841k5d', 'Margarin', NULLIF('Filma', '')),
    ('kd7e6qmsgd8qg6y2b2ryxdrxr18401zh', 'Matcha Powder', NULLIF('Dripp', '')),
    ('inv_oct26_dac8a63438d4ead1482ea3a0', 'Minyak Goreng', NULLIF('Bimoli', '')),
    ('kd7fa0mzthte034yw22kyqp5td840yve', 'Minyak Goreng', NULLIF('', '')),
    ('kd76570zrejda9zgrrrzh8fgad84fgyt', 'Minyak Wijen', NULLIF('', '')),
    ('kd77ptrdegcbyr6se213fenf7n84fhnd', 'Garlic Powder', NULLIF('', '')),
    ('bwb9cpo24rdd9dn70d5q3rq4d93v639h', 'Kamper', NULLIF('', '')),
    ('inv_a7cf2dcf34754113', 'Mayonaise', NULLIF('Maestro', '')),
    ('kd7dqfdveksmvpnq0n8krr1nfs841dkg', 'Oregano', NULLIF('YOA', '')),
    ('kd713d5q99586tspp1b754qccn84e3y7', 'Ayam Filet', NULLIF('', '')),
    ('kd77707657fgh0v1vsq3nsnym58404a7', 'Palm Sugar', NULLIF('Lahangtua', '')),
    ('kd714r98gfxac4pz9kmhsa9075840yyy', 'Biji Kopi Robusta', NULLIF('', '')),
    ('inv_8fda5379e6694244aa1583a0', 'Rokok', NULLIF('', '')),
    ('kd710wcnm5f2kdmf5w1nnpz4ms84sydj', 'Ayam', NULLIF('', '')),
    ('kd7axdjz01zvcs9eacr94rdbrn84fwa1', 'Susu Kental Manis', NULLIF('Carnation', '')),
    ('kd78aa3j5qyb6jm6913zhwt0w5841qwz', 'Sapi Cincang', NULLIF('', '')),
    ('kd731w9qwaxsre2g18xx2qpff984enk1', 'Sapi Cincang', NULLIF('', '')),
    ('kd79ty6dpr4h4x74fz0kyefe1d84tgnt', 'Bakso', NULLIF('', '')),
    ('kd7cdepzszrb6ewcsvje5sxsd9841bxq', 'Kayu Manis', NULLIF('', '')),
    ('kd7epeypx3616jemztavy695ex840r1q', 'Saus Tiram', NULLIF('Mahsuri', '')),
    ('kd76gn13vrtsv891pjgc85sess84fz3j', 'Soda Water', NULLIF('', '')),
    ('kd74pv5dtm1p1c7hhtaka9mm7x8401v8', 'Selada', NULLIF('', '')),
    ('kd75xe42533xpecnc3aqwfyze584nxef', 'Kemasan', NULLIF('', '')),
    ('kd703d4qsdrhzb61h6ferh0cpd8418r2', 'Sirup Peach', NULLIF('Tofico', '')),
    ('kd7fpsqzfcnd5ky51k7n7vq9x9841myk', 'Soda Water', NULLIF('', '')),
    ('kd75wed4e0sj3aybn8jxkkyph984fk74', 'Pembersih Lantai', NULLIF('Soklin', '')),
    ('kd72q5y1hsk05n5e6w7rfgh1jh841e6t', 'Minuman Sprite', NULLIF('', '')),
    ('kd7fjv3zk6j3tjhh79cvf8qwjd841keq', 'Sirup Lemon', NULLIF('', '')),
    ('kd761v5282wmz68vh95h75kr0h84ttmr', 'Hoisin Sauce', NULLIF('', '')),
    ('kd7bs3wj14dac6cvwd7xpth8bn841kvs', 'Susu Kelapa', NULLIF('', '')),
    ('kd7ajty5bna5vdq7yr4xmer43d840c05', 'Telur Omega', NULLIF('', '')),
    ('kd77sf70y1kvn2gykc4rkaaess84mhnj', 'Telur Ayam', NULLIF('', '')),
    ('kd73smfgpm1k1nqte6naseryxs84fgy4', 'Tepung Jagung', NULLIF('', '')),
    ('kd76ybncahe4c1xy6wqzkbm1xh841xwd', 'Timun', NULLIF('', '')),
    ('kd7fxy1ep4xsnh2e6jy3geqxgn8406ay', 'Tongcai', NULLIF('CLJ', '')),
    ('kd7bn9fycvqrqc02e9zkaa1rxx84nssp', 'Kemasan', NULLIF('', '')),
    ('kd736qz6hf6jcbvzhqwng2s5cn841414', 'Beras', NULLIF('', '')),
    ('kd775fn5sd3fhf1w8c9fc52205841wdr', 'Ubi', NULLIF('', '')),
    ('kd7b8vgdaz2hhqrvene0qg36th84fczx', 'Saus Mustard', NULLIF('Maestro', '')),
    ('kd734ddk09wdrcyc5kds02awc1840h6b', 'Kemangi', NULLIF('', '')),
    ('jerz7q3cty861zc3jr8npcjwm99y0qs2', 'Saus Tiram', NULLIF('Lee Kum Kee', '')),
    ('slge6457bt2wcnimc8zfgm6e1671vjzd', 'Vanili Bubuk', NULLIF('', '')),
    ('kd79gv0kd8t9sdw87y6hbd5nbd84fd87', 'Pencuci Piring', NULLIF('Ekonomi', '')),
    ('kd72n5jvfkjjg3nm780ybpfcxh84ddq4', 'Susu Kental Manis', NULLIF('', '')),
    ('inv_oct26_6f068ad24259eeadca8e973c', 'Kecap Anggur', NULLIF('Cap Anggur', '')),
    ('inv_oct26_522afbd9505c27638bc386f8', 'Panir', NULLIF('', '')),
    ('inv_oct26_9caf2a152af70c996dc7c3d7', 'Saus Tiram', NULLIF('Panda', '')),
    ('inv_oct26_306c0a0e3d5026b0cd3607f9', 'Thyme', NULLIF('YOA', '')),
    ('kd75ea89z551r3dyxagy8afakd840j8z', 'Jus Apel', NULLIF('', '')),
    ('kd75rgx8brzgt4gd3fw7c8tytx840tjk', 'Butter', NULLIF('Orchid', '')),
    ('kd781t4r2qka6y13fyjmxwm6f584059d', 'Minuman Pulpy', NULLIF('', '')),
    ('kd768e9qzqb7apsft9wx56xpx5840xgf', 'Kecap Manis', NULLIF('Bango', '')),
    ('kd7da8a44zczs0qnp8nrhp652x840frn', 'Kerupuk', NULLIF('', '')),
    ('kd7373vq3a0mdyqmjz6j1042vh841rze', 'Lada Putih Bubuk', NULLIF('Ladaku', '')),
    ('kd73rwm3bex79fxg47fvy8hrns840tdm', 'Lada Hitam Bubuk', NULLIF('', '')),
    ('kd77baes1zbp7m6s4gtyn8n08d840ak4', 'Sosis Sapi', NULLIF('Salam', '')),
    ('kd79gq92f44bm2y535vszvjry584m2t7', 'Kemasan', NULLIF('', '')),
    ('kd77z2w9swtpf7x4dpjbapvjg984spsg', 'Mayonaise', NULLIF('', '')),
    ('kd7azpzvyq8penm88f5bt8y8c18407hw', 'Biji Kopi Arabika', NULLIF('', '')),
    ('kd7a2k0rgjwqzeyp5zwd7je66x84v62t', 'Mix Vegetable', NULLIF('Golden Farm', '')),
    ('kd7bgt2ptsfqk47gjwz4jafg0x840pwq', 'Teh Peach', NULLIF('Max Tea', '')),
    ('inv_a68afbf0cade4bdc', 'Keju Mozarella', NULLIF('', '')),
    ('kd7egq4t8at3wd9z4x20qv9q7h84fq4f', 'Ayam Giling', NULLIF('', '')),
    ('kd76e7v4fwy69zfte8pa5pj1c584mfzb', 'Roti Tawar', NULLIF('YB', '')),
    ('kd7adntxvvz62mygt3rcqxhdm58400h1', 'Saus Tomat', NULLIF('Del Monte', '')),
    ('kd7e3k2x2qyxajfdzyeqvn135d841pxk', 'Sirup Green Apple', NULLIF('', '')),
    ('kd73swes85ta6jmscwn9xd0nhs84gj2g', 'Ebi', NULLIF('', '')),
    ('kd708zga7swksc4q5dhptdspk5840g08', 'Angkak', NULLIF('', '')),
    ('kd73mderxnq66w9zqp0xej92t584n2bx', 'Tisu', NULLIF('YOA', '')),
    ('kd77bd7c3j2yz23hndgc0wsc2n84v8x1', 'Tepung Terigu', NULLIF('', '')),
    ('kd73aj29x1s3t884x3p73d89yn84t04t', 'Saus Nasi Ayam', NULLIF('', '')),
    ('inv_c9c732df002b4ca98c8ea02b', 'Kemasan', NULLIF('', '')),
    ('kd7bpj6qh9n9nqw6wgx10yjkw58408g9', 'Air Mineral', NULLIF('Le Minerale', '')),
    ('kd7ahw1p63e6v3zxx11w0gdn4984enkx', 'Minyak Goreng', NULLIF('Tropical', '')),
    ('kd75m1dttw6nec4y66dsgagznd84szvd', 'Saus Nasi Ayam', NULLIF('', '')),
    ('kd7d00e5582bk86s7pc6tfd7ws8573gz', 'Air Mineral', NULLIF('', '')),
    ('kd790rhwxhj49fmjzrvavc77bs84wvyc', 'Kemasan', NULLIF('', '')),
    ('kd74p3pbcs6septb5m4v0kdwvh840p6m', 'Coklat Powder', NULLIF('Dripp', '')),
    ('kd7dt4tjc2ddrygq0qt8zdy36n850tfr', 'Kemasan', NULLIF('', '')),
    ('kd71w9cdpc2d5zqdvy3vezjvjn856pza', 'Minyak Goreng', NULLIF('Sunco', '')),
    ('kd7es8zfvdz7mta8gwjpxyazmh84n6tr', 'Kecap Inggris', NULLIF('', '')),
    ('kd7ej0f2cj1ghpeg322r65ewnh8416mv', 'Tulang Sapi', NULLIF('', '')),
    ('kd7deqpp0ftt6f4keckz7ztvqd84x7p2', 'Sosis Sapi', NULLIF('Bernardi', '')),
    ('kd7dbhdytqjbrytrcwvsyd8gf98405er', 'Cabe Rawit', NULLIF('', '')),
    ('kd78akhgv111p6pmj41pjkhw2184mg7a', 'Minyak Goreng', NULLIF('Rizki', '')),
    ('kd09c9cfc4c5e64927b379ef7d721b98', 'Pisang', NULLIF('', '')),
    ('inv_ea8eb818e89b489ab8e949da', 'Rokok', NULLIF('', '')),
    ('kd718c3wjcpakzs7zmgxtbbr5n84151g', 'Ayam', NULLIF('', '')),
    ('kd75j7ab1kzq1hywgtr2h9xe298407am', 'Bakso', NULLIF('', '')),
    ('kd760xn84xp67t5ftqgf789xrh84spkw', 'Saus Barbeque', NULLIF('Del Monte', '')),
    ('kd7ehnhhkndz1s5nnx5xzqzmk5840bhk', 'Bawang Merah', NULLIF('', '')),
    ('kd72n5gj25290jd3jtqcgat5mn840f98', 'Minuman C1000', NULLIF('', '')),
    ('inv_40f1a85879ba460aac13d002', 'Air', NULLIF('', '')),
    ('inv_ce47368c469f486db01858ae', 'Nasi', NULLIF('', '')),
    ('kd70nrjj6tm3x7w7gak4x6zq9984emp1', 'Paprika Powder', NULLIF('', '')),
    ('kd7a3jt6qvy1evmg90jt1h27en84f3q5', 'Kemasan', NULLIF('', '')),
    ('kd70r7s6z3y0tr82eyytbjzmqd841095', 'Bawang Putih', NULLIF('', '')),
    ('kd745vxpdbs38hkf07g37fnfys84072g', 'Roti', NULLIF('', '')),
    ('kd74jctz2ce0m61k77xa5f2pt5841404', 'Rosemary', NULLIF('YOA', '')),
    ('3byuxt3zx2wwblj41hmxodvavb67vm42', 'Bawang Putih Bubuk', NULLIF('YOA', '')),
    ('kd7c1q3r598n8cpxhkj87gsbhd84dqbv', 'Sereh', NULLIF('', '')),
    ('kd70cvggmqbq8zeaanhyve1ms58413p1', 'Sirup Elder', NULLIF('', '')),
    ('kd7fpag0rhsd6qh5smn5k0jp3s840w2g', 'Minuman Big Cola', NULLIF('', '')),
    ('kd79x5kmrd1pv1s8m3qzemht0184rr9z', 'Saus Nasi Ayam', NULLIF('', '')),
    ('kd74hrma44th6xesfaq1cjfy8s84fdnz', 'Basil', NULLIF('YOA', '')),
    ('kd76r7h916cgqqhs73y081fe4d84tjvy', 'Bumbu Instan', NULLIF('', '')),
    ('kd7ffa1pterp87gnnvrwsxz9d58407f9', 'Micin', NULLIF('', '')),
    ('kd7dq3tawd223n44q4s41sa995840vsx', 'Kaldu Jamur', NULLIF('', '')),
    ('kd766ysz670y0wrajsv20kwebs84rp2z', 'Patty', NULLIF('', '')),
    ('kd717g72k1k9cexg8psh7b3d7h8403bk', 'Saus Sambel', NULLIF('Del Monte', '')),
    ('kd789mx9xgr6pzede9nz7rvp8s84vhgg', 'Kecap Asin', NULLIF('', '')),
    ('kd77c8yn7dtng22r0mwdf66n3d84nx8k', 'Kemasan', NULLIF('', '')),
    ('kd7dzzgnj5qfajykqha370racd841c4f', 'Bawang Goreng', NULLIF('', '')),
    ('kd72ryek9k3ywwpnw4rm9ftcvx84n0ss', 'Kemasan', NULLIF('', '')),
    ('kd7bh8a39755cv8jt3rntmxe75840ncq', 'Kecap Ikan', NULLIF('Seng Guan Heng', '')),
    ('kd78vns3gkbma51jczz9pk6g8x84em7m', 'Basil', NULLIF('', '')),
    ('kd7dpnxrr197atp3afj4ab8gad8408zq', 'Single Origin', NULLIF('', '')),
    ('kd7eet4hcdrvdc32v78nfwx7v5840tag', 'Ayam Cincang', NULLIF('', '')),
    ('kd7amb3e35xynswsj6m79emy6184fxsk', 'Pembersih Kaca', NULLIF('', '')),
    ('kd763rt7spg5vw1wx7bdy2gxss85780p', 'Air Mineral', NULLIF('', '')),
    ('kd79qvd8b0fd5pdz25fr9fsxfx841y1k', 'Ngohion', NULLIF('YOA', '')),
    ('kd76sg2mxd0d8mq3jy1fn567ad84ny7b', 'Biji Kopi Robusta', NULLIF('', '')),
    ('kd75bny66x7mvnqvpt9nmjwg7n84vnzt', 'Minyak Bawang Putih', NULLIF('', '')),
    ('kd7fx5qj79c7kkt5pgmje294p984e215', 'Baterai', NULLIF('ABC', '')),
    ('kd75y6wp4cxa9b2ft57fthgj5x84ebw9', 'Gas', NULLIF('', '')),
    ('kd768t6rd9rckr6xmk19wkh1b184mmh4', 'Biji Kopi Arabika', NULLIF('', '')),
    ('kd791kpxbwqz86cxz4sjzypqk9851gm1', 'Susu UHT', NULLIF('Greenfield', '')),
    ('kd78y2nztwb0t0ypxz68tbyfyd841qbc', 'Air Galon', NULLIF('Cleo', '')),
    ('kd73dyx47kcvbba7stjckd3qhd84r2fg', 'Saus Nasi Ayam', NULLIF('', '')),
    ('kd754px87styq84wyc1nkgwd2n840q0n', 'Gula Aren', NULLIF('', '')),
    ('kd736j3qatfexyvp9ehmzj5y198412vq', 'Gula Pasir', NULLIF('', '')),
    ('inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng', NULLIF('Rose Brand', '')),
    ('inv_brand_f8a30aac4ca2dae8f8ab34c358518d04', 'Minyak Goreng', NULLIF('Sania', '')),
    ('inv_brand_b20c78fe99273f5d40083714f8ed5055', 'Minyak Goreng', NULLIF('VIPCO', '')),
    ('inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e', 'Minyak Goreng', NULLIF('Kunci Mas', '')),
    ('inv_brand_4aad069c220c76d6cc4e2e5a2bc94146', 'Minyak Goreng', NULLIF('Minyak Kita', '')),
    ('inv_brand_b1884947812479a32f39843f7820581c', 'Margarin', NULLIF('Simas', '')),
    ('inv_brand_2304e7ff18c799a2576527e7c16d57b8', 'Gula Pasir', NULLIF('Raja Gula', '')),
    ('inv_brand_2defb714a2583b3e2ea938f7d2f8d2c2', 'Gula Pasir', NULLIF('Gula Vit', '')),
    ('inv_brand_6d43a2e0bc413657e13aefe699b64b15', 'Gula Pasir', NULLIF('GKP', '')),
    ('inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk', NULLIF('Desaku', '')),
    ('inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple', NULLIF('Tofico', '')),
    ('inv_brand_72beaf2d8628b7c058424ed499a78cf0', 'Sirup Green Apple', NULLIF('Top 100', '')),
    ('inv_brand_2efb62392bb7295d09651dd9c09a989d', 'Kecap Ikan', NULLIF('Djoe Hoa', '')),
    ('inv_brand_b2251599581a7f3788e741b4226b49b3', 'Kecap Inggris', NULLIF('SNW', '')),
    ('inv_brand_636ee2e54288e63f12caff3b00f00e03', 'Kecap Inggris', NULLIF('Asia Harum', ''))
)
UPDATE pos.inventory i
SET ingredient_group = g.grup,
    default_brand_name = COALESCE(i.default_brand_name, g.merek)
FROM g
WHERE i.source_id = g.source_id
  AND (i.ingredient_group IS DISTINCT FROM g.grup
       OR (i.default_brand_name IS NULL AND g.merek IS NOT NULL));

-- 3. Baris merek baru -----------------------------------------------------
WITH baru(source_id, ingredient_name, unit, display_unit, pack_qty, pack_unit,
          aliases, category, ingredient_group, brand, price, note) AS (
  VALUES
    ('inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L', 'pcs', 'liter', 2, 'liter', '["Minyak Goreng Rose Brand 2L", "ROSE BRAND", "ROSE BRAND 2J", "Rose Brand Cooking Oil", "Rose Brand Cooking Oil Pouch 2L", "ROSE BRAND POUCH 2J", "ROSE BRAND POUCH 2L", "PWP ROSEBRN 39950"]'::jsonb, 'kitchen', 'Minyak Goreng', 'Rose Brand', 41950, 'Minyak goreng kemasan pouch 2 liter, merek Rose Brand.'),
    ('inv_brand_f8a30aac4ca2dae8f8ab34c358518d04', 'Minyak Goreng Sania 2L', 'pcs', 'liter', 2, 'liter', '["Minyak Goreng Sania 2L", "SANIA POUCH 2 LT", "Sania Cooking Oil Pouch", "PWP SANIA"]'::jsonb, 'kitchen', 'Minyak Goreng', 'Sania', 43450, 'Minyak goreng kemasan pouch 2 liter, merek Sania.'),
    ('inv_brand_b20c78fe99273f5d40083714f8ed5055', 'Minyak Goreng VIPCO 2L', 'pcs', 'liter', 2, 'liter', '["Minyak Goreng VIPCO 2L", "VIPCO", "VIPCO POUCH 2L"]'::jsonb, 'kitchen', 'Minyak Goreng', 'VIPCO', 41950, 'Minyak goreng kemasan pouch 2 liter, merek VIPCO.'),
    ('inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e', 'Minyak Goreng Kunci Mas 2L', 'pcs', 'liter', 2, 'liter', '["Minyak Goreng Kunci Mas 2L", "KUNCI MAS POUCH 2L", "Kunci Mas Cooking Oil Pouch", "Kunci Mas Cooking Oil Pouch 2L"]'::jsonb, 'kitchen', 'Minyak Goreng', 'Kunci Mas', 44500, 'Minyak goreng kemasan pouch 2 liter, merek Kunci Mas.'),
    ('inv_brand_4aad069c220c76d6cc4e2e5a2bc94146', 'Minyak Goreng Minyak Kita 2L', 'pcs', 'liter', 2, 'liter', '["Minyak Goreng Minyak Kita 2L", "Minyak Kita"]'::jsonb, 'kitchen', 'Minyak Goreng', 'Minyak Kita', 40000, 'Minyak goreng kemasan pouch 2 liter, merek Minyak Kita.'),
    ('inv_brand_b1884947812479a32f39843f7820581c', 'Margarin Simas 200g', 'pcs', 'pack', 1, 'pack', '["Margarin Simas 200g", "Simas", "Simas Margarine", "Sinas", "Cimas", "Sinar"]'::jsonb, 'kitchen', 'Margarin', 'Simas', 12500, 'Margarin Simas 200 gram. Sinas/Cimas/Sinar adalah varian OCR nama yang sama (harga sama 12.500).'),
    ('inv_brand_2304e7ff18c799a2576527e7c16d57b8', 'Gula Pasir Raja Gula 1kg', 'pcs', 'gram', 1000, 'gram', '["Gula Pasir Raja Gula 1kg", "Raja Gula", "Raja Gula 1 KG Repack"]'::jsonb, 'kitchen', 'Gula Pasir', 'Raja Gula', 17900, 'Gula pasir merek Raja Gula, kemasan 1 kg.'),
    ('inv_brand_2defb714a2583b3e2ea938f7d2f8d2c2', 'Gula Pasir Gula Vit 1kg', 'pcs', 'gram', 1000, 'gram', '["Gula Pasir Gula Vit 1kg", "Gula vit"]'::jsonb, 'kitchen', 'Gula Pasir', 'Gula Vit', 18000, 'Gula pasir merek Gula Vit, kemasan 1 kg.'),
    ('inv_brand_6d43a2e0bc413657e13aefe699b64b15', 'Gula Pasir GKP 1kg', 'pcs', 'gram', 1000, 'gram', '["Gula Pasir GKP 1kg", "Gula GKP Los", "PH GULA LOKAL 1KG"]'::jsonb, 'kitchen', 'Gula Pasir', 'GKP', 18000, 'Gula pasir GKP/lokal, kemasan 1 kg.'),
    ('inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g', 'pcs', 'gram', 100, 'gram', '["Bawang Putih Bubuk Desaku 100g", "Desaku Bubuk", "Desaku Seasoning", "DESAKUBWGPTI HBBK", "DESAKUBWGPTI HBBK 100G", "DESAKUBWGPTIBBK100G", "DESAKUBWGPTIHB8K100G", "DESAKUBWGPTIHBBK", "DESAKUBWGPTIHBBK 100G", "DESAKUBWGPTIHBBK100G", "DESAKUBWGPTIHBK100G", "DESAKUBWGTIHBBK100G"]'::jsonb, 'kitchen', 'Bawang Putih Bubuk', 'Desaku', 23800, 'Bawang putih bubuk Desaku 100 gram; berbeda merek dan ukuran dari YOA 40 gram.'),
    ('inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple Tofico', 'pcs', 'botol', 1, 'botol', '["Sirup Green Apple Tofico", "Green Apple Tofico", "Tofico Green Apel", "Tofico Green Apl", "Tofico Green Aple", "Tofico green Apple"]'::jsonb, 'bar', 'Sirup Green Apple', 'Tofico', 108000, 'Sirup green apple merek Tofico.'),
    ('inv_brand_72beaf2d8628b7c058424ed499a78cf0', 'Sirup Green Apple Top 100', 'pcs', 'botol', 1, 'botol', '["Sirup Green Apple Top 100", "Top100 green apel", "Topico green apple"]'::jsonb, 'bar', 'Sirup Green Apple', 'Top 100', 108500, 'Sirup green apple merek Top 100.'),
    ('inv_brand_2efb62392bb7295d09651dd9c09a989d', 'Kecap Ikan Djoe Hoa 620ml', 'pcs', 'ml', 620, 'ml', '["Kecap Ikan Djoe Hoa 620ml", "Djoe Hoa Cap Ikan Merah", "Djoe Hoa Cap Ikan Merah 620 ML", "Djoe Hoa kecap ikan"]'::jsonb, 'kitchen', 'Kecap Ikan', 'Djoe Hoa', 38900, 'Kecap ikan Djoe Hoa Cap Ikan Merah 620 ml.'),
    ('inv_brand_b2251599581a7f3788e741b4226b49b3', 'Kecap Inggris SNW 600ml', 'pcs', 'botol', 600, 'ml', '["Kecap Inggris SNW 600ml", "SNW KECAP ING 600ML"]'::jsonb, 'kitchen', 'Kecap Inggris', 'SNW', 81750, 'Kecap inggris merek SNW 600 ml.'),
    ('inv_brand_636ee2e54288e63f12caff3b00f00e03', 'Kecap Inggris Asia Harum', 'pcs', 'botol', 1, 'botol', '["Kecap Inggris Asia Harum", "Harum Sedap", "Kecap inggris asia harum sedep", "Kecap Inggris asra harum sedap"]'::jsonb, 'kitchen', 'Kecap Inggris', 'Asia Harum', 44500, 'Kecap inggris merek Asia Harum Sedap.')
)
INSERT INTO pos.inventory (
  source_id, ingredient_name, unit, quantity, low_stock_threshold, display_unit,
  pack_net_quantity, pack_net_unit, aliases, category, ingredient_group,
  default_brand_name, last_purchase_price, unit_status, creation_time, raw
)
SELECT
  b.source_id, b.ingredient_name, b.unit, 0, 0, b.display_unit,
  b.pack_qty, b.pack_unit, b.aliases, b.category, b.ingredient_group,
  b.brand, b.price, 'AMBIGUOUS', extract(epoch FROM now()) * 1000,
  jsonb_build_object('source', 'receipt-images-2026-07..11',
                     'report', 'reports/inventaris-merek-2026',
                     'note', b.note)
FROM baru b
WHERE NOT EXISTS (
  SELECT 1 FROM pos.inventory i
  WHERE lower(btrim(i.ingredient_name)) = lower(btrim(b.ingredient_name))
)
ON CONFLICT (source_id) DO NOTHING;

-- 4. Pindahkan alias merek dari baris generik -----------------------------
CREATE OR REPLACE FUNCTION pg_temp.drop_alias(p_existing jsonb, p_drop text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT a, ord
    FROM (
      SELECT value AS a, row_number() OVER () AS ord
      FROM jsonb_array_elements_text(coalesce(p_existing, '[]'::jsonb))
    ) s
    WHERE lower(btrim(a)) <> ALL (
      SELECT lower(btrim(x)) FROM unnest(p_drop) AS x
    )
  ) q;
$$;

CREATE OR REPLACE FUNCTION pg_temp.merge_alias(p_existing jsonb, p_add text[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(jsonb_agg(a ORDER BY ord), '[]'::jsonb)
  FROM (
    SELECT DISTINCT ON (lower(btrim(a))) a, ord
    FROM (
      SELECT value AS a, row_number() OVER () AS ord
      FROM jsonb_array_elements_text(coalesce(p_existing, '[]'::jsonb))
      UNION ALL
      SELECT x AS a, 100000 + row_number() OVER () AS ord
      FROM unnest(p_add) AS x
    ) merged
    WHERE btrim(a) <> ''
    ORDER BY lower(btrim(a)), ord
  ) dedup;
$$;

WITH buang(ingredient_name, aliases) AS (
  VALUES
    ('Minyak Goreng', ARRAY['ROSE BRAND', 'ROSE BRAND 2J', 'Rose Brand Cooking Oil', 'Rose Brand Cooking Oil Pouch 2L', 'ROSE BRAND POUCH 2J', 'ROSE BRAND POUCH 2L', 'PWP ROSEBRN 39950', 'SANIA POUCH 2 LT', 'Sania Cooking Oil Pouch', 'PWP SANIA', 'VIPCO', 'VIPCO POUCH 2L', 'KUNCI MAS POUCH 2L', 'Kunci Mas Cooking Oil Pouch', 'Kunci Mas Cooking Oil Pouch 2L', 'Minyak Kita', 'Minyak Goreng Rizki']::text[]),
    ('Margarine (Filma)', ARRAY['Simas', 'Simas Margarine', 'Sinas', 'Cimas', 'Sinar']::text[]),
    ('Gula Pasir Putih', ARRAY['Raja Gula', 'Raja Gula 1 KG Repack', 'Gula vit', 'Gula GKP Los', 'PH GULA LOKAL 1KG']::text[]),
    ('Bawang Putih Bubuk (YOA)', ARRAY['Desaku Bubuk', 'Desaku Seasoning', 'DESAKUBWGPTI HBBK', 'DESAKUBWGPTI HBBK 100G', 'DESAKUBWGPTIBBK100G', 'DESAKUBWGPTIHB8K100G', 'DESAKUBWGPTIHBBK', 'DESAKUBWGPTIHBBK 100G', 'DESAKUBWGPTIHBBK100G', 'DESAKUBWGPTIHBK100G', 'DESAKUBWGTIHBBK100G']::text[]),
    ('Sirup Green Apple', ARRAY['Green Apple Tofico', 'Tofico Green Apel', 'Tofico Green Apl', 'Tofico Green Aple', 'Tofico green Apple', 'Top100 green apel', 'Topico green apple']::text[]),
    ('Kecap Ikan', ARRAY['Djoe Hoa Cap Ikan Merah', 'Djoe Hoa Cap Ikan Merah 620 ML', 'Djoe Hoa kecap ikan']::text[]),
    ('Kecap Inggis', ARRAY['SNW KECAP ING 600ML', 'Harum Sedap', 'Kecap inggris asia harum sedep', 'Kecap Inggris asra harum sedap']::text[])
)
UPDATE pos.inventory i
SET aliases = pg_temp.drop_alias(i.aliases, b.aliases)
FROM buang b
WHERE lower(btrim(i.ingredient_name)) = lower(btrim(b.ingredient_name));

WITH tambah(ingredient_name, aliases) AS (
  VALUES
    ('Minyak Rizki', ARRAY['Minyak Goreng Rizki']::text[]),
    ('Kecap Inggis', ARRAY['Kecap Inggris']::text[])
)
UPDATE pos.inventory i
SET aliases = pg_temp.merge_alias(i.aliases, t.aliases)
FROM tambah t
WHERE lower(btrim(i.ingredient_name)) = lower(btrim(t.ingredient_name));

-- 5. Audit ---------------------------------------------------------------
ALTER TABLE pos.inventory_catalog_update_log
  DROP CONSTRAINT IF EXISTS inventory_catalog_update_log_action_check;
ALTER TABLE pos.inventory_catalog_update_log
  ADD CONSTRAINT inventory_catalog_update_log_action_check
  CHECK (action IN ('alias_added', 'material_created', 'alias_unchanged',
                  'brand_row_created', 'brand_group_set', 'alias_moved'));

INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)
SELECT i.source_id, i.ingredient_name, 'brand_row_created',
       jsonb_build_object('grup', i.ingredient_group, 'merek', i.default_brand_name,
                          'unit', i.unit, 'pack', i.pack_net_quantity, 'packUnit', i.pack_net_unit)
FROM pos.inventory i
WHERE i.source_id IN (
    'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0',
    'inv_brand_f8a30aac4ca2dae8f8ab34c358518d04',
    'inv_brand_b20c78fe99273f5d40083714f8ed5055',
    'inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e',
    'inv_brand_4aad069c220c76d6cc4e2e5a2bc94146',
    'inv_brand_b1884947812479a32f39843f7820581c',
    'inv_brand_2304e7ff18c799a2576527e7c16d57b8',
    'inv_brand_2defb714a2583b3e2ea938f7d2f8d2c2',
    'inv_brand_6d43a2e0bc413657e13aefe699b64b15',
    'inv_brand_dae6cf9c2000d160c3d461932bcf92a2',
    'inv_brand_da6646a4e9105cac6368fe13492e6381',
    'inv_brand_72beaf2d8628b7c058424ed499a78cf0',
    'inv_brand_2efb62392bb7295d09651dd9c09a989d',
    'inv_brand_b2251599581a7f3788e741b4226b49b3',
    'inv_brand_636ee2e54288e63f12caff3b00f00e03'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pos.inventory_catalog_update_log l
    WHERE l.inventory_source_id = i.source_id AND l.action = 'brand_row_created'
  );

INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)
SELECT i.source_id, i.ingredient_name, 'brand_group_set',
       jsonb_build_object('grup', i.ingredient_group, 'merek', i.default_brand_name)
FROM pos.inventory i
WHERE i.ingredient_group IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM pos.inventory_catalog_update_log l
    WHERE l.inventory_source_id = i.source_id AND l.action = 'brand_group_set'
  );

INSERT INTO pos.inventory_catalog_update_log (inventory_source_id, ingredient_name, action, detail)
SELECT i.source_id, i.ingredient_name, 'alias_moved',
       jsonb_build_object('grup', i.ingredient_group, 'merek', i.default_brand_name,
                          'aliases', i.aliases)
FROM pos.inventory i
WHERE i.source_id IN (
    'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0',
    'inv_brand_f8a30aac4ca2dae8f8ab34c358518d04',
    'inv_brand_b20c78fe99273f5d40083714f8ed5055',
    'inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e',
    'inv_brand_4aad069c220c76d6cc4e2e5a2bc94146',
    'inv_brand_b1884947812479a32f39843f7820581c',
    'inv_brand_2304e7ff18c799a2576527e7c16d57b8',
    'inv_brand_2defb714a2583b3e2ea938f7d2f8d2c2',
    'inv_brand_6d43a2e0bc413657e13aefe699b64b15',
    'inv_brand_dae6cf9c2000d160c3d461932bcf92a2',
    'inv_brand_da6646a4e9105cac6368fe13492e6381',
    'inv_brand_72beaf2d8628b7c058424ed499a78cf0',
    'inv_brand_2efb62392bb7295d09651dd9c09a989d',
    'inv_brand_b2251599581a7f3788e741b4226b49b3',
    'inv_brand_636ee2e54288e63f12caff3b00f00e03'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pos.inventory_catalog_update_log l
    WHERE l.inventory_source_id = i.source_id AND l.action = 'alias_moved'
  );

-- 6. Titik kandidat review ikut diarahkan ke baris merek ------------------
WITH peta(kunci, source_id, nama) AS (
  VALUES
    ('rose brand', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('rose brand 2j', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('rose brand cooking oil', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('rose brand cooking oil pouch 2l', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('rose brand pouch 2j', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('rose brand pouch 2l', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('pwp rosebrn 39950', 'inv_brand_e3af0e896da391a2b8a0a741afc9c5a0', 'Minyak Goreng Rose Brand 2L'),
    ('sania pouch 2 lt', 'inv_brand_f8a30aac4ca2dae8f8ab34c358518d04', 'Minyak Goreng Sania 2L'),
    ('sania cooking oil pouch', 'inv_brand_f8a30aac4ca2dae8f8ab34c358518d04', 'Minyak Goreng Sania 2L'),
    ('pwp sania', 'inv_brand_f8a30aac4ca2dae8f8ab34c358518d04', 'Minyak Goreng Sania 2L'),
    ('vipco', 'inv_brand_b20c78fe99273f5d40083714f8ed5055', 'Minyak Goreng VIPCO 2L'),
    ('vipco pouch 2l', 'inv_brand_b20c78fe99273f5d40083714f8ed5055', 'Minyak Goreng VIPCO 2L'),
    ('kunci mas pouch 2l', 'inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e', 'Minyak Goreng Kunci Mas 2L'),
    ('kunci mas cooking oil pouch', 'inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e', 'Minyak Goreng Kunci Mas 2L'),
    ('kunci mas cooking oil pouch 2l', 'inv_brand_2c0d7fa8d7e25e7554c3935ce719b44e', 'Minyak Goreng Kunci Mas 2L'),
    ('minyak kita', 'inv_brand_4aad069c220c76d6cc4e2e5a2bc94146', 'Minyak Goreng Minyak Kita 2L'),
    ('simas', 'inv_brand_b1884947812479a32f39843f7820581c', 'Margarin Simas 200g'),
    ('simas margarine', 'inv_brand_b1884947812479a32f39843f7820581c', 'Margarin Simas 200g'),
    ('sinas', 'inv_brand_b1884947812479a32f39843f7820581c', 'Margarin Simas 200g'),
    ('cimas', 'inv_brand_b1884947812479a32f39843f7820581c', 'Margarin Simas 200g'),
    ('sinar', 'inv_brand_b1884947812479a32f39843f7820581c', 'Margarin Simas 200g'),
    ('raja gula', 'inv_brand_2304e7ff18c799a2576527e7c16d57b8', 'Gula Pasir Raja Gula 1kg'),
    ('raja gula 1 kg repack', 'inv_brand_2304e7ff18c799a2576527e7c16d57b8', 'Gula Pasir Raja Gula 1kg'),
    ('gula vit', 'inv_brand_2defb714a2583b3e2ea938f7d2f8d2c2', 'Gula Pasir Gula Vit 1kg'),
    ('gula gkp los', 'inv_brand_6d43a2e0bc413657e13aefe699b64b15', 'Gula Pasir GKP 1kg'),
    ('ph gula lokal 1kg', 'inv_brand_6d43a2e0bc413657e13aefe699b64b15', 'Gula Pasir GKP 1kg'),
    ('desaku bubuk', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desaku seasoning', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgpti hbbk', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgpti hbbk 100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgptibbk100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgptihb8k100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgptihbbk', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgptihbbk 100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgptihbbk100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgptihbk100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('desakubwgtihbbk100g', 'inv_brand_dae6cf9c2000d160c3d461932bcf92a2', 'Bawang Putih Bubuk Desaku 100g'),
    ('green apple tofico', 'inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple Tofico'),
    ('tofico green apel', 'inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple Tofico'),
    ('tofico green apl', 'inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple Tofico'),
    ('tofico green aple', 'inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple Tofico'),
    ('tofico green apple', 'inv_brand_da6646a4e9105cac6368fe13492e6381', 'Sirup Green Apple Tofico'),
    ('top100 green apel', 'inv_brand_72beaf2d8628b7c058424ed499a78cf0', 'Sirup Green Apple Top 100'),
    ('topico green apple', 'inv_brand_72beaf2d8628b7c058424ed499a78cf0', 'Sirup Green Apple Top 100'),
    ('djoe hoa cap ikan merah', 'inv_brand_2efb62392bb7295d09651dd9c09a989d', 'Kecap Ikan Djoe Hoa 620ml'),
    ('djoe hoa cap ikan merah 620 ml', 'inv_brand_2efb62392bb7295d09651dd9c09a989d', 'Kecap Ikan Djoe Hoa 620ml'),
    ('djoe hoa kecap ikan', 'inv_brand_2efb62392bb7295d09651dd9c09a989d', 'Kecap Ikan Djoe Hoa 620ml'),
    ('snw kecap ing 600ml', 'inv_brand_b2251599581a7f3788e741b4226b49b3', 'Kecap Inggris SNW 600ml'),
    ('harum sedap', 'inv_brand_636ee2e54288e63f12caff3b00f00e03', 'Kecap Inggris Asia Harum'),
    ('kecap inggris asia harum sedep', 'inv_brand_636ee2e54288e63f12caff3b00f00e03', 'Kecap Inggris Asia Harum'),
    ('kecap inggris asra harum sedap', 'inv_brand_636ee2e54288e63f12caff3b00f00e03', 'Kecap Inggris Asia Harum')
)
UPDATE pos.inventory_item_candidates c
SET proposed_inventory_source_id = p.source_id,
    proposed_canonical_name = p.nama,
    match_status = 'ALIAS_MATCH'
FROM peta p
WHERE c.normalized_name_key = p.kunci
  AND c.reviewed_by IS NULL;

-- 7. View perbandingan harga per grup ------------------------------------
CREATE OR REPLACE VIEW pos.inventory_group_options AS
SELECT
  i.ingredient_group AS group_name,
  i.source_id,
  i.ingredient_name,
  i.default_brand_name AS brand,
  i.unit,
  i.display_unit,
  i.pack_net_quantity,
  i.pack_net_unit,
  i.quantity,
  i.last_purchase_price,
  i.last_purchase_at,
  row_number() OVER (
    PARTITION BY i.ingredient_group
    ORDER BY i.last_purchase_price NULLS LAST, i.ingredient_name
  ) AS price_rank
FROM pos.inventory i
WHERE i.ingredient_group IS NOT NULL;

COMMENT ON VIEW pos.inventory_group_options IS
  'Pilihan merek per grup bahan, diurutkan dari harga terakhir termurah.';

COMMIT;
