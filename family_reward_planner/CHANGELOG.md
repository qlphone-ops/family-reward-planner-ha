# Changelog

## 0.2.3

- Panel rodzica pobiera teraz realną listę kont Home Assistant przez Core WebSocket API (`config/auth/list`) zamiast pokazywać tylko użytkowników, którzy wcześniej otworzyli aplikację.
- Dostęp do pierwszej konfiguracji rodziców jest ograniczony do administratorów Home Assistant, a po wyborze rodziców panel jest dostępny dla wskazanych kont.
- Poprawiono responsywność panelu rodzica: desktop korzysta z szerokiego układu, a mobile z pełnej szerokości bez wąskiej ramki.

## 0.2.2

- Zmieniono nazwę aplikacji w sklepie Home Assistant na `Obowiązki dzieci`.
- Zmieniono tytuł w sidebarze Home Assistant na `Obowiązki dzieci`.

## 0.2.1

- Dane aplikacji w Home Assistant są zapisywane wyłącznie po stronie add-ona w `/data/planner-state.json`, aby każdy użytkownik domu widział ten sam stan.
- Dodano wybór rodziców w panelu aplikacji na podstawie użytkowników Home Assistant widzianych przez add-on.
- Usunięto ręczne wpisywanie `parent_users` z widocznej konfiguracji add-ona.
- Rozdzielono historię obowiązków i gwiazdek od historii kuponów. Historia kuponów jest widoczna w sklepie.
- Dodano filtrowanie historii po dniach oraz przewijane panele historii.
- Dodano górne menu na karcie dziecka i w sklepie.
- Poprawiono obsługę wejścia do panelu rodzica przez osobny skrót Home Assistant.

## 0.2.0

- Usunięto dzieci wpisane na sztywno w kodzie. Rodzic może teraz dodawać dowolną liczbę dzieci.
- Dodano panel zarządzania dziećmi z wyborem stylu karty: chłopiec albo dziewczynka.
- Dodano podstawową historię aktywności dzieci.
- Poprawiono wejście do modułu rodzica przez osobny skrót w Home Assistant z zachowaniem kontroli `parent_users`.
- Uszczelniono sklep nagród dla sytuacji, gdy rodzic usunie wszystkie nagrody.

## 0.1.8

- Usunięto reset prototypu z ekranu głównego i kodu aplikacji.
- Przeniesiono metryczkę dzisiejszego dnia do prawego górnego obszaru ekranu głównego.
- Dodano osobny add-on skrótu `Obowiązki dzieci (Panel rodzica)`, który otwiera panel rodzica z menu Home Assistant.

## 0.1.7

- Dodano changelog widoczny w Home Assistant podczas aktualizacji.
- Doprecyzowano obsługę modułu rodzica pod ścieżką `/parent`.

## 0.1.6

- Wstrzyknięto CSS i JavaScript bezpośrednio do HTML, aby aplikacja działała stabilnie pod Home Assistant Ingress.
- Dodano wersję aplikacji do logu startowego i endpointu `/healthz`.

## 0.1.5

- Uruchamianie backendu przeniesiono do usługi s6 w obrazie Home Assistant.

## 0.1.4

- Dodano obsługę adresów Ingress z prefiksem `/app/...`.

## 0.1.3

- Dodano obsługę prefiksu Ingress dla adresów aplikacji i zasobów statycznych.

## 0.1.2

- Przygotowano strukturę zdalnego repozytorium Home Assistant.

## 0.1.1

- Poprawiono budowanie obrazu dla architektury `aarch64`.

## 0.1.0

- Pierwsza wersja MVP aplikacji.
