import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { onAuthChange } from "./services/supabase";
import { CAR_TYPE_OWNED, engineDB } from "./services/db";
import { useThemeMode } from "./hooks/useThemeMode";
import { captureError, identifyUser, resetUser, trackPageView } from "./services/observability";
import { AchievementAnnouncer } from "./components/achievements/AchievementAnnouncer";
import { InstallPrompt } from "./components/InstallPrompt";
import { ConsentBanner } from "./components/ConsentBanner";
import { UpdateBanner } from "./components/UpdateBanner";
import "./index.css";

import { Sidebar } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { MobileNav } from "./components/MobileNav";
import { Topbar } from "./components/TopBar"; // Importando em .jsx
import { RequireAuth } from "./components/RequireAuth";
import { Footer } from "./components/Footer";
import { RegionPicker } from "./components/RegionPicker";
import { useConfirm } from "./components/ConfirmProvider";
import { Home } from "./pages/Home";
import { Garagem } from "./pages/Garagem";

import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { useToast } from "./components/ToastProvider";

// Carregamento sob demanda. Até 25/09/2026 o app inteiro era UM arquivo de
// 2,9 MB (870 KB gzip) — nada pintava antes dele baixar e ser lido, e a Mia
// mediu ~7 s até a primeira tela num Moto G com 4G. Ficam no pacote inicial
// só as portas de entrada (Início, Garagem, Login, Cadastro); cada outra
// página, e cada modal global, vem quando é usada. O ECharts, sozinho
// 1,1 MB, só baixa no Painel.
const lazyNamed = (loader, name) => lazy(() => loader().then((module) => ({ default: module[name] })));
const ContributionModal = lazyNamed(() => import("./components/ContributionModal"), "ContributionModal");
const ExpensesModal = lazyNamed(() => import("./components/ExpensesModal"), "ExpensesModal");
const Terms = lazyNamed(() => import("./pages/Terms"), "Terms");
const Privacy = lazyNamed(() => import("./pages/Privacy"), "Privacy");
const PostPage = lazyNamed(() => import("./pages/PostPage"), "PostPage");
const ModalNewCar = lazyNamed(() => import("./components/ModalNewCar"), "ModalNewCar");
const OwnershipModal = lazyNamed(() => import("./components/OwnershipModal"), "OwnershipModal");
const SpecSheetModal = lazyNamed(() => import("./components/specsheet/SpecSheetModal"), "SpecSheetModal");
const DashboardPage = lazyNamed(() => import("./pages/DashboardPage"), "DashboardPage");
const Settings = lazyNamed(() => import("./pages/Settings"), "Settings");
const Community = lazyNamed(() => import("./pages/Community"), "Community");
const Messages = lazyNamed(() => import("./pages/Messages"), "Messages");
const ResetPassword = lazyNamed(() => import("./pages/ResetPassword"), "ResetPassword");
const Events = lazyNamed(() => import("./pages/Events"), "Events");
const ClubsPage = lazyNamed(() => import("./pages/ClubsPage"), "ClubsPage");
const ClubDetailPage = lazyNamed(() => import("./pages/ClubDetailPage"), "ClubDetailPage");
const EventDetails = lazyNamed(() => import("./pages/EventDetails"), "EventDetails");
const UserProfile = lazyNamed(() => import("./pages/UserProfile"), "UserProfile");
const Services = lazyNamed(() => import("./pages/Services"), "Services");
const ServiceApprovals = lazyNamed(() => import("./pages/Services"), "ServiceApprovals");
const Plans = lazyNamed(() => import("./pages/Plans"), "Plans");
const Support = lazyNamed(() => import("./pages/Support"), "Support");
const Advertise = lazyNamed(() => import("./pages/Advertise"), "Advertise");

/**
 * Numa SPA a troca de tela não recarrega a página, então o pageview não sai
 * de graça: precisa ser disparado a cada mudança de rota.
 */
function RouteTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}

function App() {
  const showToast = useToast();
  const { i18n, t } = useTranslation();
  const confirm = useConfirm();
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbLoading, setDbLoading] = useState(true);
  const [cars, setCars] = useState([]);
  // Leitura da garagem que falhou sem cache pra mostrar. Sem isso, a tela
  // dizia "adicione seu primeiro carro" para quem tem sete.
  const [carsError, setCarsError] = useState(null);
  const [settings, setSettings] = useState(engineDB.getDefaultSettings());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [carToEdit, setCarToEdit] = useState(null);
  const [ownershipCar, setOwnershipCar] = useState(null);
  const [contributionCar, setContributionCar] = useState(null);
  const [expenseCar, setExpenseCar] = useState(null);
  const [specsCar, setSpecsCar] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const userId = user?.uid;
  const isTopNav = settings.preferences.navLayout === "topnav";

  useThemeMode(settings.preferences.theme);

  useEffect(() => {
    const unsubscribe = onAuthChange((currentUser) => {
      engineDB.setCurrentUser(currentUser?.uid);
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) identifyUser(currentUser);
      else resetUser();
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelado = false;

    engineDB.setCurrentUser(userId || null);
    // Limpa a garagem de forma SÍNCRONA ao sair da conta. Se isto esperasse o
    // await abaixo, os carros da conta anterior ficariam na tela durante a
    // leitura das preferências.
    if (!userId) setCars([]);

    (async () => {
      setDbLoading(true);
      try {
        // Convidado também tem preferências. Tema, idioma e região já eram
        // GRAVADOS por `saveSettings` (o botão de tema chama), mas aqui a
        // leitura era descartada e trocada pelo default — e o default é
        // `theme: "dark"`. Resultado: quem navegava sem conta escolhia o tema
        // claro e o perdia em toda recarga. `getSettings` já sabe ler o modo
        // local sem usuário; só não estava sendo chamado.
        if (!userId) {
          const savedSettings = await engineDB.getSettings();
          if (cancelado) return;
          setSettings(savedSettings);
          if (i18n.language !== savedSettings.preferences.language) {
            i18n.changeLanguage(savedSettings.preferences.language);
          }
          return;
        }

        // A migracao NUNCA pode barrar a leitura. Se estourasse aqui, o catch
        // la embaixo pegava e o efeito terminava sem chamar `getCars()`: a
        // garagem ficava vazia com `carsError` nulo, que e a tela do vazio
        // legitimo — a que agora nomeia a conta. Falhou, seguiu; o erro vai
        // para o Sentry em vez de ir para a cara da pessoa como "voce nao tem
        // carro nenhum".
        await engineDB.migrateLegacyData(userId).catch((error) => {
          captureError(error, { action: "migrateLegacyData" });
        });
        // `allSettled` de proposito: a garagem falhar nao pode levar junto as
        // preferencias (tema, idioma, regiao), e o erro dela tem endereco
        // proprio na tela em vez de virar garagem vazia.
        const [resultadoCarros, resultadoAjustes] = await Promise.allSettled([
          engineDB.getCars(),
          engineDB.getSettings(),
        ]);
        if (cancelado) return;
        if (resultadoCarros.status === "fulfilled") {
          setCars(resultadoCarros.value);
          setCarsError(null);
        } else {
          setCarsError(resultadoCarros.reason);
          captureError(resultadoCarros.reason, { action: "getCars" });
        }
        if (resultadoAjustes.status === "rejected") throw resultadoAjustes.reason;
        const savedSettings = resultadoAjustes.value;
        setSettings(savedSettings);
        // O perfil público só era escrito ao salvar os ajustes — quem nunca
        // entrou lá aparecia como "Usuário Engine" para os outros.
        engineDB
          .syncPublicProfile(savedSettings, userId)
          .catch((error) => console.warn("syncPublicProfile", error));
        if (i18n.language !== savedSettings.preferences.language) {
          i18n.changeLanguage(savedSettings.preferences.language);
        }
      } catch (error) {
        console.error(error);
        // Sem preferências legíveis, o default é melhor que tela travada.
        if (!cancelado) setSettings(engineDB.getDefaultSettings());
      } finally {
        if (!cancelado) setDbLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [i18n, userId]);

  /**
   * Re-leitura da garagem depois de uma escrita, e o botao de tentar de novo.
   *
   * A escrita ja deu certo quando isto roda. Se a re-leitura falhar, o certo e
   * avisar e MANTER na tela o que ja se tem — nunca esvaziar a garagem por
   * causa dela. Devolve null quando falhou, pra quem chamou nao tentar ler
   * uma lista que nao veio.
   */
  const recarregarCarros = async () => {
    try {
      const atualizados = await engineDB.getCars();
      setCars(atualizados);
      setCarsError(null);
      return atualizados;
    } catch (error) {
      setCarsError(error);
      captureError(error, { action: "recarregarCarros" });
      return null;
    }
  };

  const handleOpenModal = (car = null) => {
    setCarToEdit(car);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCarToEdit(null);
  };

  const saveCarAction = async (carData) => {
    try {
      await engineDB.saveCar(carData);
      await recarregarCarros();
      handleCloseModal();
      return true;
    } catch (error) {
      captureError(error, { action: "saveCar", carId: carData?.id });
      // Devolve o motivo pra quem chamou: "não foi possível salvar" sem dizer
      // por quê fez a foto sumir sem explicação.
      return { ok: false, message: error.message };
    }
  };

  /**
   * Ficha tecnica declarada pelo dono.
   *
   * Passa pelo mesmo `saveCar` do resto do carro de proposito: a ficha mora no
   * documento do carro (`normalizeCar` ja normaliza `specs`), entao qualquer
   * caminho paralelo daria duas verdades sobre o mesmo objeto. O carro
   * atualizado volta para o estado local para o modal poder redesenhar a ficha
   * resolvida — incluindo o que a correcao acabou de destravar.
   */
  const saveSpecsAction = async (car, specs) => {
    try {
      const updated = { ...car, specs };
      await engineDB.saveCar(updated);
      const updatedCars = await recarregarCarros();
      setSpecsCar(updatedCars?.find((item) => item.id === car.id) || updated);
      return true;
    } catch (error) {
      captureError(error, { action: "saveSpecs", carId: car?.id });
      return { ok: false, message: error.message };
    }
  };

  const saveOwnershipAction = async (car, ownershipInputs) => {
    try {
      await engineDB.saveCar({ ...car, ownership: ownershipInputs });
      await recarregarCarros();
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  };

  /**
   * "Consegui, o carro é meu": a meta vira carro da garagem.
   *
   * É a conversão natural entre os dois tipos — bater a meta significa passar
   * a ter o carro. Fica atrás de confirmação porque muda o significado do
   * registro: some a barra de progresso e o carro para de aceitar aporte.
   */
  const markCarAchieved = async (car) => {
    const ok = await confirm({
      title: t("car.markAchievedTitle"),
      message: t("car.markAchievedMessage", {
        carName: `${car.brand} ${car.model}`,
      }),
      confirmLabel: t("car.markAchievedConfirm"),
      cancelLabel: t("common.cancel"),
    });
    if (!ok) return;

    await saveCarAction({
      ...car,
      type: CAR_TYPE_OWNED,
      savedValue: car.targetValue || car.savedValue,
    });
  };

  /**
   * Depois de lançar um aporte, a lista e o próprio modal precisam do carro
   * novo — senão o histórico só aparece no próximo carregamento e a previsão
   * fica desatualizada na cara de quem acabou de registrar.
   */
  const handleContributionSaved = (updatedCar) => {
    if (!updatedCar) return;
    setCars((current) =>
      current.map((item) => (item.id === updatedCar.id ? updatedCar : item)),
    );
    setContributionCar(updatedCar);
  };

  /** Mesmo motivo do aporte: o resumo precisa refletir o lançamento na hora. */
  const handleExpenseSaved = (updatedCar) => {
    if (!updatedCar) return;
    setCars((current) =>
      current.map((item) => (item.id === updatedCar.id ? updatedCar : item)),
    );
    setExpenseCar(updatedCar);
  };

  const openDeleteConfirmation = async (car) => {
    const percentage = car.targetValue
      ? (car.savedValue / car.targetValue) * 100
      : 0;
    const carName = `${car.brand} ${car.model}`;

    const ok = await confirm({
      title: t("deleteModal.title"),
      message: t("deleteModal.message", {
        carName,
        percentage: percentage.toFixed(0),
      }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("deleteModal.keep"),
    });
    if (!ok) return;

    try {
      await engineDB.deleteCar(car.id);
    } catch (error) {
      showToast(error?.message || t("deleteModal.error"), "error");
      return;
    }
    // Se a re-leitura falhar, o carro ja foi apagado no banco: tira da tela
    // pelo id em vez de deixar um fantasma clicavel.
    const atualizados = await recarregarCarros();
    if (!atualizados) setCars((atual) => atual.filter((item) => item.id !== car.id));
  };

  if (authLoading) {
    return <div className="min-h-screen bg-[var(--engine-bg)]" />;
  }

  return (
    <BrowserRouter>
      <RouteTracker />
      <UpdateBanner />
      <InstallPrompt />
      <ConsentBanner />
      <Routes>
        {/* Páginas de autenticação: tela cheia, sem o shell do app. */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Páginas legais ficam fora do shell e sem exigir login: precisam
            abrir pra visitante, pro Google e pra revisão das lojas. */}
        <Route path="/termos" element={<Terms />} />
        <Route path="/privacidade" element={<Privacy />} />

        {/* Publicação por link direto, fora do shell: quem chega por um link
            compartilhado cai no conteúdo, não no feed com um modal por cima. */}
        <Route path="/post/:postId" element={<PostPage user={user} />} />

        {/* O Engine abre sem login. Início, comunidade e serviços são
            livres para visitantes; as rotas pessoais ficam protegidas por
            RequireAuth, que mostra um convite em vez de barrar na porta. */}
        <Route
          element={
            <AppLayout
              user={user}
              settings={settings}
              onSettingsUpdate={setSettings}
              isTopNav={isTopNav}
              dbLoading={dbLoading}
              sidebarCollapsed={sidebarCollapsed}
              onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
              isModalOpen={isModalOpen}
              carToEdit={carToEdit}
              onCloseModal={handleCloseModal}
              onSaveCar={saveCarAction}
              cars={cars}
              ownershipCar={ownershipCar}
              onCloseOwnership={() => setOwnershipCar(null)}
              onSaveOwnership={saveOwnershipAction}
              contributionCar={contributionCar}
              onCloseContribution={() => setContributionCar(null)}
              onContributionSaved={handleContributionSaved}
              expenseCar={expenseCar}
              onCloseExpense={() => setExpenseCar(null)}
              onExpenseSaved={handleExpenseSaved}
              specsCar={specsCar}
              onCloseSpecs={() => setSpecsCar(null)}
              onSaveSpecs={saveSpecsAction}
            />
          }
        >
          <Route path="/" element={<Home />} />
          <Route
            path="/garagem"
            element={
              <RequireAuth user={user}>
                <Garagem
                  cars={cars}
                  onOpenModal={handleOpenModal}
                  onOpenDelete={openDeleteConfirmation}
                  onOpenOwnership={setOwnershipCar}
                  onAddContribution={setContributionCar}
                  onAddExpense={setExpenseCar}
                  onMarkAchieved={markCarAchieved}
                  onOpenSpecs={setSpecsCar}
                  defaultSort={settings.preferences.defaultGarageSort}
                  hideValues={settings.privacy.lockSensitiveValues}
                  loadError={carsError}
                  onRetry={recarregarCarros}
                  accountEmail={user?.email || ""}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth user={user}>
                <DashboardPage
                  cars={cars}
                  settings={settings}
                  onOpenOwnership={setOwnershipCar}
                />
              </RequireAuth>
            }
          />
          <Route
            path="/community"
            element={<Community cars={cars} settings={settings} user={user} />}
          />
          <Route
            path="/community/:identifier"
            element={<UserProfile settings={settings} user={user} onSettingsUpdate={setSettings} />}
          />
          {/* Clubes tem endereço próprio além da aba da Comunidade: um clube
              é a coisa que se manda para alguém ("olha o nosso clube"), e um
              link que só abre a aba certa por parâmetro não sobrevive a ser
              colado. Aberto a visitante, como o resto da Comunidade — o card
              é público e quem não está logado vê o convite ao entrar. */}
          <Route path="/clubs" element={<ClubsPage user={user} />} />
          <Route path="/clubs/:clubId" element={<ClubDetailPage />} />
          <Route
            path="/messages"
            element={
              <RequireAuth user={user}>
                <Messages user={user} settings={settings} />
              </RequireAuth>
            }
          />
          <Route
            path="/messages/:conversationId"
            element={
              <RequireAuth user={user}>
                <Messages user={user} settings={settings} />
              </RequireAuth>
            }
          />
          <Route
            path="/services"
            element={<Services settings={settings} user={user} />}
          />
          <Route
            path="/services/approvals"
            element={
              <RequireAuth user={user}>
                <ServiceApprovals user={user} />
              </RequireAuth>
            }
          />
          <Route
            path="/events"
            element={<Events user={user} />}
          />
          <Route
            path="/events/:eventId"
            element={<EventDetails />}
          />
          {/* Planos, Apoie e Anuncie abrem para visitante: quem chega pelo
              rodapé ou por link precisa ver preço e avisos antes de criar
              conta. Só o botão de pagar pede login. */}
          <Route path="/planos" element={<Plans user={user} />} />
          <Route path="/apoie" element={<Support />} />
          <Route path="/anuncie" element={<Advertise user={user} />} />
          <Route
            path="/settings"
            element={
              <RequireAuth user={user}>
                <Settings
                  user={user}
                  settings={settings}
                  onSettingsUpdate={setSettings}
                />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Shell do app (navegação + área de conteúdo) compartilhado por todas as
 * rotas não-autenticação. Renderiza o <Outlet /> da rota casada. Fica
 * acessível a visitantes sem login — as rotas pessoais se protegem sozinhas
 * via RequireAuth.
 */
/** Enquanto a página pedida baixa. Curto e sem texto: aparece por instantes. */
function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" aria-busy="true">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--engine-border)] border-t-[var(--engine-accent)]" />
    </div>
  );
}

function AppLayout({
  user,
  settings,
  onSettingsUpdate,
  isTopNav,
  dbLoading,
  sidebarCollapsed,
  onToggleSidebar,
  isModalOpen,
  carToEdit,
  onCloseModal,
  onSaveCar,
  cars,
  ownershipCar,
  onCloseOwnership,
  onSaveOwnership,
  contributionCar,
  onCloseContribution,
  onContributionSaved,
  expenseCar,
  onCloseExpense,
  onExpenseSaved,
  specsCar,
  onCloseSpecs,
  onSaveSpecs,
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const isMessages = location.pathname.startsWith("/messages");

  return (
    <div
      className={`flex min-h-[100dvh] flex-col bg-[var(--engine-bg)] font-sans text-[var(--engine-text)] transition-colors ${
        isTopNav ? "" : "lg:h-[100dvh] lg:flex-row lg:overflow-hidden"
      }`}
    >
      {/* No mobile a rolagem é a do documento (barra de endereço recolhe,
          pull-to-refresh funciona); o painel com rolagem interna só entra
          no desktop, onde a sidebar precisa ficar fixa. */}
      <MobileNav
        profileSettings={settings.profile}
        settings={settings}
        onSettingsUpdate={onSettingsUpdate}
        user={user}
      />

      {isTopNav ? (
        <TopNav
          settings={settings}
          onSettingsUpdate={onSettingsUpdate}
          user={user}
          profileSettings={settings.profile}
        />
      ) : (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapsed={onToggleSidebar}
          profileSettings={settings.profile}
          privacySettings={settings.privacy}
          user={user}
          className="hidden lg:flex"
        />
      )}

      <main
        className={`engine-scroll flex min-h-0 min-w-0 flex-1 flex-col px-4 py-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-10 lg:py-8 lg:pb-8 ${
          isTopNav ? "" : "lg:h-[100dvh] lg:overflow-y-auto"
        }`}
      >
        {/* No layout sidebar, a Topbar global fica no topo do conteúdo (só
            no desktop — no mobile as mesmas ações vivem no header fixo).
            No layout top-nav, ela já está embutida no TopNav. */}
        {!dbLoading && !isTopNav && (
          <div className="engine-container hidden lg:block">
            <div className="flex w-full items-center justify-end gap-1.5 border-b border-[var(--engine-border)] pb-4">
              <RegionPicker className="mr-1" />
              <Topbar
                settings={settings}
                onSettingsUpdate={onSettingsUpdate}
                user={user}
              />
            </div>
          </div>
        )}

        {dbLoading ? (
          <div className="flex h-full items-center justify-center text-[var(--engine-text-subtle)] italic">
            {t("common.loading")}
          </div>
        ) : (
          <div
            className={`engine-container flex flex-1 flex-col ${isTopNav ? "" : "lg:mt-6"}`}
          >
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </div>
        )}

        {/* Rodapé global — acompanha o conteúdo no fim da rolagem. */}
        {!dbLoading && !isMessages && <Footer />}
      </main>

      {/* A key remonta o formulário a cada carro: sem isso o modal fica
          montado e carrega marca/modelo/ano/preço do carro anterior. */}
      {/* Modais globais só existem quando abertos: é o que deixa cada um
          vir sob demanda. A key segue remontando o formulário a cada carro. */}
      <Suspense fallback={null}>
      {isModalOpen && (
        <ModalNewCar
          key={carToEdit?.id ?? "new"}
          isOpen={isModalOpen}
          onClose={onCloseModal}
          onSave={onSaveCar}
          carToEdit={carToEdit}
        />
      )}

      {ownershipCar && (
        <OwnershipModal
          isOpen={Boolean(ownershipCar)}
          car={ownershipCar}
          cars={cars}
          settings={settings}
          onSettingsUpdate={onSettingsUpdate}
          onClose={onCloseOwnership}
          onSave={onSaveOwnership}
        />
      )}

      {contributionCar && (
        <ContributionModal
          car={contributionCar}
          onClose={onCloseContribution}
          onSaved={onContributionSaved}
        />
      )}

      {expenseCar && (
        <ExpensesModal
          car={expenseCar}
          onClose={onCloseExpense}
          onSaved={onExpenseSaved}
        />
      )}

      {specsCar && (
        <SpecSheetModal
          car={specsCar}
          onClose={onCloseSpecs}
          onSave={(specs) => onSaveSpecs(specsCar, specs)}
        />
      )}
      </Suspense>

      {/* Conquista e concedida no fundo, de tres telas diferentes. O aviso mora
          aqui em cima para nao depender de qual delas estava aberta. */}
      <AchievementAnnouncer userId={user?.uid} />
    </div>
  );
}

export default App;
