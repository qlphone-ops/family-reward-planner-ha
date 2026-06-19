# Changelog

## 0.3.2

- Naprawiono adresowanie akcji zapisu w Home Assistant Ingress. Aplikacja obsługuje teraz zarówno nowe adresy `/app/...`, jak i klasyczne `/api/hassio_ingress/...`, więc odznaczanie obowiązków nie zależy od wariantu adresu panelu Home Assistant.
- Komunikaty błędów zapisu rozróżniają brak trasy, chwilową niedostępność aplikacji i błąd połączenia.

## 0.3.1

- Przebudowano mobilną kartę obowiązków: zwarto ułożono nagłówek, dzień i saldo, a hero z postępem nie ma już pustego pola ze strzałką.
- Uporządkowano mobilne menu dziecka, sekcje pór dnia, historię oraz komunikat kończący dzień.
- Usunięto powielone przyciski na dole karty i sklepu; nawigacja jest dostępna w jednym górnym menu.

## 0.3.0

- Przebudowano zapis danych na dzienny model: `completions`, `dailyStars` i `couponEvents`.
- Wyłączono zapis całego stanu przez klienta. Zmiany przechodzą teraz przez walidowane akcje serwerowe `/api/action`.
- Ograniczono akcje rodzica do panelu rodzica i wskazanych kont Home Assistant/administratorów.
- Dodano migrację starych pól `task.done` i `starAwardedToday` do nowego dziennego modelu.
- Rozdzielono historię kuponów od historii obowiązków na poziomie danych.
- Zabezpieczono bootstrap JSON oraz najważniejsze pola renderowane w HTML przed wstrzyknięciem kodu.
- Dopolerowano dark mode i mobilne układy panelu rodzica dla nowych list zarządzania.

## 0.2.5

- Wzmocniono zapis stanu w Home Assistant: niezapisane zmiany są ponawiane, a przy opuszczaniu aplikacji wysyłane przez `sendBeacon`/`keepalive`.
- Zabezpieczono powrót z iOS/HA webview przed pobraniem starego stanu z serwera, jeśli w przeglądarce czeka jeszcze niezapisana zmiana.
- Backend przyjmuje awaryjny zapis `POST /api/state` i loguje udane zapisy stanu, co ułatwia diagnostykę problemów z pamięcią.
- Dodano dark mode sterowany z panelu rodzica i zapisywany jako wspólne ustawienie domu.
- Przebudowano główny ekran panelu rodzica na dashboard z metrykami, akceptacjami i kafelkami zarządzania.
- Poprawiono mobilny układ karty obowiązków dziecka.
- Dodano ikonę aplikacji dla listy dodatków Home Assistant.

## 0.2.4

- Poprawiono trwały zapis danych w Home Assistant: zmiany obowiązków, gwiazdek, kuponów, nagród i historii są zapisywane natychmiast do `/data/planner-state.json`.
- Zwykłe odświeżenie widoku nie zapisuje już ponownie niezmienionego stanu, co ogranicza ryzyko nadpisania świeżych danych starszym widokiem.
- Dodano odświeżanie stanu po powrocie do otwartego okna aplikacji, aby panel rodzica widział zamówienia złożone na ekranie dziecka.

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
