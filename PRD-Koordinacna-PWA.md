# PRD: Koordinačná PWA s live mapou pre skupiny

## 1) Vízia produktu

Aplikácia je koordinačný nástroj pre ľudí, ktorí sa pohybujú v cudzom meste (púte, výlety, skupinové akcie). Cieľ je, aby sa členovia vedeli rýchlo nájsť, dohodnúť stretnutie a získať prehľad o stave skupiny bez chaosu v správach.

Produkt je navrhnutý čisto ako PWA (bez nutnosti inštalácie cez App Store/Google Play), ale s povinným onboardingom pre uloženie na plochu.

---

## 2) Ciele aplikácie

### Primárne ciele

- Umožniť používateľom nájsť sa navzájom cez live mapu.
- Zjednodušiť koordináciu celej skupiny, podskupín aj jednotlivcov.
- Znížiť stres pri presunoch v neznámom prostredí.
- Udržať nízku bariéru vstupu (otvor link, povol polohu, ulož na plochu, funguješ).

### Sekundárne ciele

- Poskytnúť organizátorom rýchly prehľad o dostupnosti členov.
- Zlepšiť reakčný čas pri strate kontaktu alebo meškaní.
- Dať používateľom kontrolu nad tým, komu a kedy sa zobrazujú (módy a filtre).
- Dať hlavnému vedúcemu kontrolu nad citlivými funkciami (audit trail / incident režim).

---

## 3) Cieľové skupiny používateľov a roly

- Admin (spravuje aplikáciu, nie priebeh akcie).
- Hlavný vedúci (riadi konkrétnu akciu).
- Vedúci skupiny (role prideľuje hlavný vedúci).
- Bežný účastník.
- Člen podskupiny (napr. autobus, partia, rodina, tím).

---

## 4) Definície: skupina vs podskupina

- Skupina: logický tím vytvorený používateľom, kde majú všetci členovia rovné práva.
- Podskupina: v pôvodnom návrhu bola chápaná ako menšia časť hlavnej akcie. Pre jednoduchosť produktu bude implementovaná rovnakým modelom ako skupina.

Pravidlo produktu:

- Aplikácia používa jednotný pojem skupina.
- Každý používateľ môže byť vo viacerých skupinách.
- Každý člen skupiny má rovné práva v rámci danej skupiny.
- Hlavný vedúci a vedúci sú roly na úrovni celej akcie, nie špeciálne práva "vnútri skupiny" (okrem zásahov vyplývajúcich z role, napr. hromadné pingy alebo incident režim).
- Admin je systémová rola pre správu aplikácie a konfigurácie; nevystupuje ako operačný vedúci akcie.

---

## 5) Kľúčové funkcie (scope)

### Už definované

- Live mapa členov.
- Pingovanie:
  - vedúci vie pingnúť všetkých, vybranú skupinu alebo jednotlivca,
  - používateľ vie pingnúť svoju skupinu alebo konkrétneho používateľa.
- Profil používateľa na mape:
  - online / posledná poloha,
  - aktualizované pred X minútami,
  - skupina.
- Tvorba viacerých skupín.
- Módy mapy:
  - všetci členovia,
  - len vybraná skupina alebo viac skupín,
  - len vybraní používatelia.
- Vyhľadávanie členov:
  - podľa mena,
  - podľa skupiny,
  - podľa mapy (výrez mapy / blízkosť).
- Admin panel:
  - systémová správa aplikácie (admin),
  - prideľovanie rolí v akcii (hlavný vedúci, vedúci, účastník),
  - prepínač citlivých funkcií,
  - monitoring API limitov a nákladov.
- Povinný onboarding po prvom vstupe:
  - návod uloženia na plochu pre Android a iOS,
  - blokácia plného používania bez dokončenia onboarding kroku.

### Nové doplnené funkcie

- Smart status používateľa.
- Ping cooldown + priority.
- Meeting point s ETA.
- Kompas/orientácia na mape (viditeľná aj pre ostatných používateľov).
- Filter vrstiev na mape.
- Jednoduchý audit trail.
- Admin monitoring limitov + feature toggles pre mapové API funkcie.

---

## 6) Onboarding a povinné uloženie na plochu

Po prvom vstupe aplikácia spustí krátky, vizuálne jasný tutorial (animácie + stručné kroky) pre uloženie na plochu.

Požiadavky:

- Detekcia platformy a verzie:
  - Android (Chrome flow),
  - iOS (Safari "Pridať na plochu").
- Tutorial vysvetlí, prečo je uloženie na plochu dôležité (stabilnejšie používanie, rýchly prístup, lepšie notifikácie).
- Bez dokončenia tohto kroku nebude možné používať hlavnú mapu a ping funkcie.
- Používateľ môže vidieť "help modal" s návodom aj neskôr v nastaveniach.

---

## 7) Funkčné ciele podľa doplnených funkcií

### 5.1 Smart status používateľa

Používateľ má dynamický stav, ktorý zjednoduší orientáciu:

- Online teraz.
- Naposledy aktívny pred X minútami.
- Pohybuje sa / stojí (odvodené z posledných aktualizácií polohy).

Prínos:

- Vedúci aj členovia okamžite vedia, kto je dostupný a kto už dlhšie neaktualizoval polohu.

### 5.2 Ping cooldown + priority

Ping systém má ochranu proti spamu:

- cooldown na opakované pingy,
- priorita pingu:
  - Info,
  - Stretnime sa,
  - Urgent.

Prínos:

- Menej notifikačného chaosu, vyššia dôveryhodnosť dôležitých upozornení.

### 7.3 Meeting point s ETA

Meeting point sa dá vytvoriť v troch úrovniach:

- globálny meeting point pre všetkých (hlavný vedúci / vedúci),
- meeting point pre konkrétnu skupinu (člen skupiny),
- meeting point pre vybraných členov (peer-to-peer alebo malá ad-hoc skupina).

Pri každom členovi je viditeľné:

- odhadovaný čas príchodu (ETA),
- vzdialenosť od bodu stretnutia.

Prínos:

- Rýchle rozhodovanie, koho čakať, koho pingnúť, či posunúť čas odchodu.

### 7.4 Kompas/orientácia na mape

Pri používateľovi je na mape zobrazená orientácia, ktorým smerom sa pozerá (heading z kompasu zariadenia), ak je dostupná dostatočne presná hodnota.
Ak heading nie je spoľahlivý, aplikácia zobrazí posledný stabilný smer alebo orientáciu skryje.

Prínos:

- Členovia vidia nielen kde sa niekto nachádza, ale aj ktorým smerom je otočený, čo výrazne pomáha pri fyzickom dohľadaní v teréne.

### 7.5 Filter vrstiev na mape

Mapa má prepínateľné vrstvy:

- všetci,
- moja skupina / skupiny,
- vybraní používatelia,
- meeting pointy,
- audit trail vrstva.

Prínos:

- Lepšia čitateľnosť mapy pri väčšom počte členov.

### 7.6 Jednoduchý audit trail + incident režim

Pri používateľovi je dostupná stručná história posledných polôh (čas + bod na mape).

Prínos:

- Pomáha spätne pochopiť pohyb pri meškaní alebo strate kontaktu.

Riadenie citlivej funkcie:

- Audit trail je voliteľný a hlavný vedúci ho vie zapnúť/vypnúť.
- Odporúčaný default pre bežnú prevádzku: vypnuté.
- Pri zapnutí incident režimu:
  - vytvorí sa incident (napr. "hľadanie člena"),
  - aktivuje sa audit trail pre dotknutých používateľov podľa pravidiel incidentu,
  - dotknutý používateľ je informovaný notifikáciou, že je predmetom hľadania,
  - členovia definovaní incidentom dostanú notifikáciu s kontextom.

### 7.7 Vyhľadávanie členov

Aplikácia poskytuje tri režimy vyhľadávania:

- textové vyhľadávanie podľa mena,
- filtrovanie podľa skupiny,
- mapové vyhľadávanie (členovia vo výreze mapy / v blízkosti bodu).

Prínos:

- Používateľ rýchlo nájde relevantných ľudí aj pri veľkom počte členov.

### 7.8 Admin panel: limity, rozpočty a feature toggles

Admin panel obsahuje sekciu "API monitoring a limity", kde admin vidí:

- spotrebu podľa SKU (Dynamic Maps, Routes, Places),
- dennú a mesačnú spotrebu requestov,
- odhad nákladov (today / month-to-date / forecast do konca mesiaca),
- percento využitia free threshold a nastavených interných limitov.

Admin panel obsahuje sekciu "Feature toggles", kde admin vie zapnúť/vypnúť:

- presné ETA po uliciach (Routes API),
- Places vyhľadávanie na mape,
- audit trail,
- incident režim (alebo ho obmedziť len na hlavného vedúceho).

Ochranné mechanizmy:

- warning prahy (napr. 50 %, 80 %, 100 % interného limitu),
- hard limit mód (po prekročení limitu sa funkcia automaticky prepne na fallback),
- fallback režimy:
  - ETA po priamej vzdialenosti (bez Routes API),
  - vypnuté Places vyhľadávanie, no mapa zostáva funkčná.

---

## 8) User stories

### 8.1 Admin (správa aplikácie)

- Ako admin chcem spravovať systémové nastavenia aplikácie, aby produkt fungoval stabilne.
- Ako admin chcem mať prehľad o inštanciách akcií a technickom stave, aby som vedel riešiť prevádzkové problémy.
- Ako admin chcem vidieť spotrebu Maps/Routes/Places API a odhad nákladov, aby som vedel udržať rozpočet.
- Ako admin chcem zapínať a vypínať ETA po uliciach a Places, aby som vedel reagovať na limity alebo vysoké náklady.

### 8.2 Hlavný vedúci

- Ako hlavný vedúci chcem nastavovať roly používateľov v rámci akcie, aby som vedel určiť vedúcich.
- Ako hlavný vedúci chcem zapnúť alebo vypnúť audit trail, aby som vedel riadiť citlivé funkcie.
- Ako hlavný vedúci chcem vytvoriť incident hľadania, aby som vedel aktivovať núdzový režim koordinácie.

### 8.3 Vedúci skupiny

- Ako vedúci chcem jedným krokom pingnúť všetkých členov, aby som rýchlo zvolal skupinu.
- Ako vedúci chcem pingnúť konkrétnu skupinu, aby som nemusel rušiť ostatných.
- Ako vedúci chcem vidieť online stav a čas poslednej aktualizácie pri každom členovi, aby som vedel kto je reálne dostupný.
- Ako vedúci chcem vytvoriť globálny meeting point a vidieť ETA členov, aby som vedel či čakať alebo presunúť plán.
- Ako vedúci chcem filtrovať mapu na skupiny/osoby a hľadať podľa mena, aby bola mapa prehľadná.
- Ako vedúci chcem vidieť audit trail iba vtedy, keď je povolený hlavným vedúcim alebo aktivovaný incident.

### 8.4 Bežný používateľ

- Ako používateľ chcem pingnúť konkrétneho človeka, keď sa potrebujem rýchlo stretnúť.
- Ako používateľ chcem pingnúť svoju skupinu, keď ju neviem nájsť.
- Ako používateľ chcem vidieť polohu členov a ich orientáciu, aby som ich vedel fyzicky dohľadať.
- Ako používateľ chcem vidieť pri ľuďoch údaj "aktualizované pred X minútami", aby som vedel či je poloha čerstvá.
- Ako používateľ chcem prepnúť mapu na "len vybraní", aby som sa sústredil na ľudí, ktorých práve hľadám.
- Ako používateľ chcem vytvoriť meeting point pre svoju skupinu alebo pre ľubovoľne vybraných členov.
- Ako používateľ chcem po prvom otvorení jasný návod na uloženie appky na plochu, aby appka fungovala spoľahlivo.

### 8.5 Tvorca skupín

- Ako používateľ chcem vytvoriť viac skupiniek, aby som vedel oddeliť rôzne časti programu.
- Ako používateľ chcem pridávať/odoberať členov zo skupiniek, aby zostali aktuálne.
- Ako používateľ chcem mapu prepnúť iba na svoju skupinku, aby som sa nestratil v dátach celej akcie.
- Ako člen skupiny chcem mať rovnaké práva ako ostatní členovia skupiny.

---

## 9) Využitie aplikácie (praktické scenáre)

### Scenár A: Presun po meste

- Skupina sa rozdelí na menšie tímy.
- Každý vidí na mape svoju skupinu alebo vybraných ľudí.
- Keď sa niekto oddelí, pingne skupinu s prioritou "Stretnime sa".
- Ostatní vidia jeho poslednú polohu aj orientáciu.

### Scenár B: Zraz na meeting pointe

- Vedúci nastaví globálny meeting point (napr. námestie).
- Všetci vidia vzdialenosť a ETA k bodu stretnutia.
- Meškajúcich vedúci cielene pingne (nie celú skupinu).

### Scenár C: Rýchla koordinácia podskupín

- Organizátor prepne mapu na konkrétnu skupinu (napr. Autobus A).
- Skontroluje smart status členov.
- Pri nejasnostiach otvorí audit trail posledných bodov.

### Scenár D: Hľadanie konkrétneho človeka

- Používateľ prepne filter na "vybraní používatelia".
- Vyberie konkrétnu osobu.
- Podľa polohy + orientácie + poslednej aktivity ju rýchlo dohľadá.

### Scenár E: Meeting point pre vybraných členov

- Menšia ad-hoc skupina členov sa chce stretnúť bez rušenia celej skupiny.
- Jeden používateľ vytvorí meeting point a vyberie konkrétnych členov.
- Všetci vybraní členovia vidia ETA a navádzanie na spoločné miesto.

### Scenár F: Incident hľadania osoby

- Hlavný vedúci (prípadne vedúci podľa nastavenia oprávnení) založí incident.
- Dotknuté osoby dostanú notifikáciu.
- Hľadaný používateľ je informovaný, že je predmetom hľadania.
- Systém dočasne sprístupní audit trail podľa pravidiel incidentu.

---

## 10) Definícia úspechu (MVP metriky)

- Čas na pripojenie nového člena do skupiny: do 30 sekúnd.
- Úspešné nájdenie človeka/skupiny cez mapu bez externého chatu.
- Zníženie "kde ste?" komunikácie v externých messengeroch.
- Aktívne používanie mapových filtrov a pingov počas presunov.
- Dokončenie onboarding flow uloženia na plochu pri prvom vstupe.
- Úspešné použitie vyhľadávania (meno/skupina/mapa) pri veľkej skupine.

---

## 11) Poznámka k PWA realite

Keďže aplikácia je čisto PWA, treba rátať s obmedzeniami background GPS (najmä iOS). Návrh preto stojí na:

- čo najlepšej práci s čerstvou a poslednou známou polohou,
- jasnom stave online/last update,
- rýchlych interakciách (ping, meeting point, filtre),
- koordinácii v reálnom čase, keď je aplikácia aktívne používaná.

---

## 12) Pravidlá práv a governance

- Roly v aplikácii:
  - admin (správca aplikácie),
  - hlavný vedúci (rola v konkrétnej akcii),
  - vedúci,
  - účastník.
- Vedúcich nastavuje hlavný vedúci v rozhraní akcie.
- V rámci skupín majú členovia rovné práva.
- Citlivé funkcie (audit trail/incident) sú pod kontrolou hlavného vedúceho.
- API limity, rozpočty a globálne feature toggles (Routes/Places) sú pod kontrolou admina.

