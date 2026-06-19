# Changelog

## 0.1.7

- Panel rodzica może być widoczny w menu Home Assistant dla zwykłych użytkowników, a dostęp jest weryfikowany przez główną aplikację na podstawie wybranych rodziców.
- Skrót nadal przekazuje specjalny nagłówek proxy, dzięki któremu pierwsza konfiguracja może odbyć się przez osobny moduł rodzica.

## 0.1.6

- Dodano ikonę skrótu panelu rodzica widoczną na liście dodatków Home Assistant.

## 0.1.5

- Zmieniono skrót rodzica z przekierowania na proxy do modułu `/parent` głównej aplikacji.
- Panel rodzica nie powinien już przeskakiwać na ekran dzieci po kliknięciu w sidebarze Home Assistant.
- Proxy przekazuje także wywołania `/api/*`, więc panel rodzica działa pod własnym wpisem w menu.

## 0.1.4

- Naprawiono otwieranie panelu rodzica pod Home Assistant Ingress, gdy Supervisor przekazuje do skrótu ścieżkę `/` albo `//`.
- Skrót rodzica wylicza adres głównej aplikacji także z nagłówka `X-Ingress-Path`, dzięki czemu nie powinien restartować się na błędzie `ERR_INVALID_URL`.

## 0.1.3

- Zmieniono nazwę dodatku w sklepie Home Assistant na `Obowiązki dzieci (Panel rodzica)`.
- Zmieniono tytuł w sidebarze Home Assistant na `Panel rodzica`.

## 0.1.2

- Zmieniono otwieranie panelu rodzica tak, aby skrót w menu Home Assistant przełączał całe okno do głównej aplikacji, zamiast ładować Home Assistant wewnątrz Home Assistant.

## 0.1.1

- Poprawiono obsługę ścieżki `//` zwracanej przez Home Assistant Ingress.
- Skrót rodzica przekierowuje teraz do głównej aplikacji z parametrem `?module=parent`.

## 0.1.0

- Pierwsza wersja skrótu do panelu rodzica.
