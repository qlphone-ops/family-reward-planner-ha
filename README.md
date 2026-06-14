# Domowy Planner Nagród

Home Assistant OS app/add-on dla rodzinnego planera obowiązków:

- karty dzieci,
- codzienne obowiązki,
- gwiazdki za cały dzień,
- sklep nagród,
- kupony do akceptacji rodzica,
- dni wolne od szkoły,
- tryb wakacji,
- osobny moduł dziecka i rodzica.

## Moduły

- `/child` - ekran dziecięcy na tablet/kiosk. Nie pokazuje wejścia do panelu rodzica.
- `/parent` - panel rodzica do akceptacji kuponów i zarządzania obowiązkami, nagrodami oraz kalendarzem.

W add-onie `ingress_entry` wskazuje domyślnie `/child`, czyli panel w sidebarze otwiera ekran dziecięcy.

## Dane

Stan aplikacji jest zapisywany lokalnie w:

```text
/data/planner-state.json
```

To oznacza, że tablet dzieci i telefon rodzica widzą wspólny stan.

## Dostęp rodzica

Opcja `parent_users` pozwala wskazać użytkowników Home Assistant, którzy mogą otworzyć `/parent`.

Przykład:

```yaml
parent_users:
  - jaroslaw
  - 1234567890abcdef
```

Backend sprawdza kilka typowych nagłówków ingress/user:

- `x-hass-user-id`
- `x-hass-user`
- `x-ha-user-id`
- `x-ha-user`
- `remote-user`
- `x-forwarded-user`

Jeśli `parent_users` jest puste, panel rodzica jest dostępny dla każdego użytkownika, który ma dostęp do ingress add-ona. Po pierwszym uruchomieniu w Home Assistant trzeba sprawdzić w logach/nagłówkach, który identyfikator użytkownika przekazuje Twoja instalacja, i wpisać go w opcjach.

## Instalacja w Home Assistant bez terminala

Docelowo aplikację instalujemy z repozytorium GitHub, a nie przez ręczne kopiowanie plików w terminalu.

1. Otwórz Home Assistant w przeglądarce.

2. Wejdź w ekran zarządzania dodatkami/aplikacjami w Home Assistant.

3. Otwórz listę repozytoriów dodatków/aplikacji.

4. Dodaj adres repozytorium GitHub z aplikacją `Domowy Planner Nagród`.

5. Odśwież listę dostępnych aplikacji/dodatków.

6. Wybierz `Domowy Planner Nagród` i kliknij instalację.

7. W konfiguracji aplikacji ustaw `parent_users`, jeśli chcesz ograniczyć `/parent` tylko do kont rodziców.

8. Uruchom aplikację i otwórz panel `Planner Nagród`.

Aktualizacje również wykonujemy z interfejsu Home Assistant:

1. Wgrywamy nową wersję do GitHuba.

2. W Home Assistant odświeżamy repozytorium aplikacji/dodatków.

3. Jeśli pojawi się aktualizacja `Domowy Planner Nagród`, klikamy aktualizację z poziomu UI.

Nie zakładamy używania terminala HA do instalacji ani aktualizacji. Terminal zostaje tylko jako awaryjne narzędzie diagnostyczne, np. gdy trzeba sprawdzić szczegółowe logi.

## Tymczasowa instalacja lokalna

Ten wariant jest tylko do testów deweloperskich. Nie jest docelową ścieżką dla domowego użycia.

Folder add-ona można umieścić w lokalnym repozytorium Home Assistant przez Samba albo Studio Code Server, a potem zainstalować z interfejsu HA. Po przejściu na repo GitHub ten rozdział można usunąć.

## Lokalny development

```bash
node server.js
```

Adresy:

- `http://127.0.0.1:8099/child`
- `http://127.0.0.1:8099/parent`
- `http://127.0.0.1:8099/healthz`

Do lokalnego testu danych:

```bash
PLANNER_DATA_DIR=. node server.js
```

## Rollback

Przed aktualizacją skopiuj:

```text
/data/planner-state.json
```

Rollback polega na przywróceniu poprzedniej wersji folderu add-ona i tego pliku danych.
