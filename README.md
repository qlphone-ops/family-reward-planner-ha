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

## Instalacja lokalna w Home Assistant OS

1. Skopiuj folder add-ona do lokalnego repozytorium add-onów, np. przez Samba/Studio Code Server:

```text
/addons/family_reward_planner
```

2. W Home Assistant przejdź do:

```text
Ustawienia -> Dodatki -> Sklep z dodatkami -> ... -> Repozytoria
```

3. Dodaj lokalne repozytorium albo odśwież lokalne dodatki.

4. Zainstaluj `Domowy Planner Nagród`.

5. W konfiguracji add-ona ustaw `parent_users`, jeśli chcesz ograniczyć `/parent`.

6. Uruchom add-on i otwórz panel `Planner Nagród`.

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
