import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth, updateAuthProfile } from '../services/supabase';
import { engineDB } from '../services/db';
import { splitPhone, isPhoneValid } from '../services/phone';
import { PhoneField } from './PhoneField';
import { countries, getStates } from '../services/locations';
import { AVATAR, BANNER, reduzirImagem } from '../services/imagens';
import { storeDataUri } from '../services/photos';
import { useToast } from './ToastProvider';
import { useHistoryDismiss } from '../hooks/useHistoryDismiss';
import { MentionTextarea } from './mentions/MentionTextarea';
import { useMediaPicker } from "../hooks/useMediaPicker";
import {
  BIO_DISPLAY_MAX,
  bioToEditor,
  fetchMentionCards,
  mentionRefs,
  serializeBio,
  syncBioMentions,
} from '../services/mentions';
import { Select } from "./ui/Select";

// Salva pelo mesmo caminho das Configurações (engineDB.saveSettings), que
// reserva o @, grava os ajustes e espelha o perfil público. Antes o modal
// escrevia direto em publicProfiles, com o @ sem a arroba e com nomes de campo
// que o perfil não lê: o nome não mudava, a capa não aparecia e o perfil
// sumia da busca por @.
export function EditProfileModal({ isOpen, onClose, onSave, settings = {} }) {
  const user = auth.currentUser;
  const showToast = useToast();
  const { t } = useTranslation();
  const profile = settings.profile || {};

  // Bio com @menção: no editor, `@[tipo:id]` vira `@Rótulo` (com o nome
  // ATUAL, vindo do banco). Até os cartões chegarem o campo fica travado —
  // salvar antes apagaria as menções.
  const hasTokens = mentionRefs(profile.bio || '').length > 0;
  const [bioMentions, setBioMentions] = useState([]);
  const [bioReady, setBioReady] = useState(!hasTokens);

  const [formData, setFormData] = useState({
    displayName: profile.displayName || user?.displayName || '',
    username: profile.username || '',
    bio: profile.bio || '',
    phone: profile.phone || '',
    country: profile.country || 'BR',
    state: profile.state || '',
    city: profile.location || '',
  });

  const [preview, setPreview] = useState({
    avatar: profile.avatar || null,
    banner: profile.banner || null,
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [bioCharCount, setBioCharCount] = useState(formData.bio.length);

  useEffect(() => {
    if (!hasTokens || !user?.uid) return undefined;
    let alive = true;
    fetchMentionCards(user.uid).then((cards) => {
      if (!alive) return;
      const { value, mentions } = bioToEditor(profile.bio || '', cards);
      setFormData((prev) => ({ ...prev, bio: value }));
      setBioCharCount(value.length);
      setBioMentions(mentions);
      setBioReady(true);
    });
    return () => {
      alive = false;
    };
    // Só na abertura: depois disso o texto é de quem está editando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const countryObj = countries.find(c => c.code === formData.country);
  const stateOptions = countryObj ? getStates(formData.country) : [];

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleCountryChange = (value) => {
    handleFieldChange('country', value);
    handleFieldChange('state', '');
    handleFieldChange('city', '');
  };

  const handleStateChange = (value) => {
    handleFieldChange('state', value);
    handleFieldChange('city', '');
  };

  const handleBioChange = (value, mentions = bioMentions) => {
    if (value.length <= BIO_DISPLAY_MAX) {
      handleFieldChange('bio', value);
      setBioCharCount(value.length);
      setBioMentions(mentions);
    }
  };

  const handleUsernameChange = (value) => {
    // Remove @ se existir
    let cleanValue = value.replace(/^@/, '');

    // Se vazio, coloca só @
    if (!cleanValue) {
      handleFieldChange('username', '@');
      return;
    }

    // Mesmas regras do normalizeUsername do db: minúsculas, números, . e _,
    // até 24. Aceitar mais aqui e cortar lá mudava o @ sem avisar.
    cleanValue = cleanValue.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24);

    // Adiciona @ na frente
    const newUsername = `@${cleanValue}`;
    handleFieldChange('username', newUsername);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.displayName.trim()) {
      newErrors.displayName = 'Nome público é obrigatório';
    }
    if (formData.displayName.length > 50) {
      newErrors.displayName = 'Nome não pode exceder 50 caracteres';
    }

    if (!formData.username || formData.username === '@') {
      newErrors.username = 'Nome de usuário é obrigatório';
    }
    // Remove @ pra validar apenas os caracteres
    const usernameWithoutAt = formData.username.replace(/^@/, '');
    if (usernameWithoutAt.length < 3 || usernameWithoutAt.length > 24) {
      newErrors.username = 'Username deve ter 3–24 caracteres';
    }

    const { dial, number } = splitPhone(formData.phone);
    if (number && !isPhoneValid(dial, number)) {
      newErrors.phone = 'Telefone incompleto';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // A foto e reduzida ANTES de virar preview, e o preview e exatamente o que
  // sera gravado — assim o que a pessoa ve e o que vai para o banco. Antes
  // guardava-se o arquivo original em base64: no celular, 3 a 8 MB de camera,
  // que estouram o documento do Firestore e o `photoURL` do Auth. Falhava no
  // `console.error`, sem nada na tela, e a foto simplesmente nao mudava.
  const handleFileInput = async (field, file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Escolha um arquivo de imagem.', { tone: 'warning' });
      return;
    }

    try {
      const reduzida = await reduzirImagem(file, field === 'avatar' ? AVATAR : BANNER);
      setPreview(prev => ({ ...prev, [field]: reduzida }));
    } catch {
      showToast('Nao consegui usar essa imagem. Tente outra foto.', { tone: 'warning' });
    }
  };

  // No celular, abrir pergunta se e foto nova ou da galeria (07/11/2026) —
  // retrato de perfil e justamente o que a pessoa quer tirar na hora.
  const avatarPicker = useMediaPicker({
    accept: "image/*",
    capture: "user",
    onFiles: (files) => handleFileInput("avatar", files[0]),
  });
  const bannerPicker = useMediaPicker({
    accept: "image/*",
    onFiles: (files) => handleFileInput("banner", files[0]),
  });

  const handleAvatarClick = () => {
    avatarPicker.open();
  };

  const handleBannerClick = () => {
    bannerPicker.open();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--engine-accent)';
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '';
  };

  const handleDrop = (e, field) => {
    e.preventDefault();
    e.currentTarget.style.borderColor = '';
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFileInput(field, file);
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      console.error('Por favor, corrija os erros no formulário');
      return;
    }

    setLoading(true);
    try {
      // Só o código do país, sem número, é campo vazio — não "+55".
      const phone = splitPhone(formData.phone).number ? formData.phone : '';
      // A foto reduzida sobe para o Storage e o perfil guarda só a URL: ela
      // é copiada em post, comentário e conversa, e em base64 pesava em todos.
      const [avatar, banner] = await Promise.all([
        storeDataUri(preview.avatar || '', { userId: user.uid, folder: 'avatar' }),
        storeDataUri(preview.banner || '', { userId: user.uid, folder: 'banner' }),
      ]);
      // `@Rótulo` escolhido no autocompletar → marcador com id.
      const { bio: storedBio } = serializeBio(formData.bio, bioMentions);
      const saved = await engineDB.saveSettings(
        {
          ...settings,
          profile: {
            ...profile,
            displayName: formData.displayName,
            username: formData.username,
            bio: storedBio,
            phone,
            country: formData.country,
            state: formData.state,
            location: formData.city,
            // A foto é a versão reduzida do preview (ver handleFileInput).
            avatar,
            banner,
          },
        },
        user.uid,
      );

      // As menções valem quando o banco grava a lista (limite, bloqueio, aviso
      // para quem foi mencionado). Falhar aqui não desfaz o perfil salvo.
      try {
        const result = await syncBioMentions(storedBio);
        if (result?.skipped?.length) showToast(t('mentions.someSkipped'), 'info');
      } catch (error) {
        showToast(
          error?.code === 'too-many-mentions' ? t('mentions.limit', { count: 10 }) : t('mentions.saveError'),
          'error',
        );
      }

      // Foto em data URI não vai para a conta: ela viajaria dentro do token,
      // em toda requisição. Só URL do Storage.
      const urlParaAuth = /^https?:\/\//.test(avatar) ? avatar : null;
      await updateAuthProfile({
        displayName: formData.displayName,
        ...(urlParaAuth ? { photoURL: urlParaAuth } : {}),
      }).catch((error) => console.warn('updateProfile', error));

      if (onSave) {
        onSave(saved);
      }

      showToast('Perfil atualizado.');
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      // Erro que so ia pro console: a pessoa apertava Salvar, nada acontecia e
      // o modal ficava aberto sem dizer por que.
      // saveSettings recusa @ já usado com mensagem própria; essa vale mostrar.
      showToast(
        err?.code === 'permission-denied'
          ? 'Sem permissao para salvar este perfil.'
          : err?.message || 'Nao consegui salvar o perfil. Tente de novo.',
        { tone: 'warning' },
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // Voltar no Android fecha o modal em vez de sair do perfil.
  useHistoryDismiss(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={(e) => {
      if (e.target === e.currentTarget) handleCancel();
    }}>
      <div className="w-full sm:max-w-2xl bg-[var(--engine-surface)] rounded-t-2xl sm:rounded-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 sm:p-6 border-b border-[var(--engine-border)] bg-[var(--engine-surface)]">
          <h1 className="text-lg font-semibold text-[var(--engine-text)]">Editar Perfil</h1>
          <button
            onClick={handleCancel}
            /* 44x44: media 32x32 (13/09/2026). */
            className="flex items-center justify-center w-11 h-11 -m-1.5 rounded-full text-[var(--engine-text-muted)] hover:bg-[var(--engine-surface-2)] transition"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-8">
          {/* Media Section */}
          <div>
            {/* Banner */}
            <div
              onClick={handleBannerClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'banner')}
              className="relative w-full h-44 mb-4 bg-[var(--engine-surface-2)] border-2 border-dashed border-[var(--engine-border)] rounded-lg cursor-pointer transition hover:border-[var(--engine-accent)] overflow-hidden flex items-center justify-center"
              style={{
                backgroundImage: preview.banner ? `url('${preview.banner}')` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {bannerPicker.elementos}
              {!preview.banner && (
                <div className="text-center pointer-events-none">
                  <p className="text-sm font-medium text-[var(--engine-text-muted)]">Clique ou arraste uma imagem</p>
                </div>
              )}
            </div>

            {/* Avatar */}
            <div className="flex justify-center pb-8">
              <div
                onClick={handleAvatarClick}
                className="relative w-24 h-24 rounded-full overflow-hidden bg-[var(--engine-surface-2)] border-4 border-[var(--engine-surface)] cursor-pointer transition hover:border-[var(--engine-accent)] flex items-center justify-center group"
              >
                {avatarPicker.elementos}
                {preview.avatar ? (
                  <img
                    src={preview.avatar}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-3xl">A</div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center rounded-full transition text-white text-sm">
                  Editar
                </div>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--engine-text-muted)] mb-4">Informações Básicas</p>
            <div className="space-y-4">
              {/* Display Name */}
              <div>
                <label className="text-sm font-medium text-[var(--engine-text)]">
                  Nome Público <span className="text-[var(--engine-accent)]">*</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  placeholder="Seu nome completo"
                  value={formData.displayName}
                  onChange={(e) => handleFieldChange('displayName', e.target.value)}
                  className={`w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border rounded-lg text-sm transition focus:outline-none focus:border-[var(--engine-accent)] focus:ring-4 focus:ring-[var(--engine-accent)]/20 ${
                    errors.displayName ? 'border-red-500' : 'border-[var(--engine-border)]'
                  }`}
                />
                {errors.displayName && (
                  <p className="text-xs text-red-500 mt-1">{errors.displayName}</p>
                )}
              </div>

              {/* Username */}
              <div>
                <label className="text-sm font-medium text-[var(--engine-text)]">
                  Usuário <span className="text-[var(--engine-accent)]">*</span>
                </label>
                <input
                  type="text"
                  maxLength={31}
                  placeholder="@username"
                  value={formData.username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  className={`w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border rounded-lg text-sm font-mono transition focus:outline-none focus:border-[var(--engine-accent)] focus:ring-4 focus:ring-[var(--engine-accent)]/20 ${
                    errors.username ? 'border-red-500' : 'border-[var(--engine-border)]'
                  }`}
                />
                <p className="text-xs text-[var(--engine-text-subtle)] mt-1">@ é adicionado automaticamente • 3–24 caracteres: letras, números, . e _</p>
                {errors.username && (
                  <p className="text-xs text-red-500 mt-1">{errors.username}</p>
                )}
              </div>

              {/* Bio */}
              <div>
                <label htmlFor="edit-profile-bio" className="text-sm font-medium text-[var(--engine-text)]">Bio</label>
                <div className="mt-2">
                  {bioReady ? (
                    <MentionTextarea
                      id="edit-profile-bio"
                      maxLength={BIO_DISPLAY_MAX}
                      placeholder={t('mentions.bioPlaceholder')}
                      value={formData.bio}
                      mentions={bioMentions}
                      onChange={(value, mentions) => handleBioChange(value, mentions)}
                      className="w-full px-3 py-2.5 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm resize-none min-h-24 transition focus:outline-none focus:border-[var(--engine-accent)] focus:ring-4 focus:ring-[var(--engine-accent)]/20"
                    />
                  ) : (
                    <div className="min-h-24 w-full animate-pulse rounded-lg bg-[var(--engine-surface-2)]" aria-busy="true" />
                  )}
                </div>
                <p className="text-xs text-[var(--engine-text-subtle)] mt-1">
                  {bioCharCount}/{BIO_DISPLAY_MAX} · {t('mentions.bioHint')}
                </p>
              </div>
            </div>
          </div>

          {/* Contact */}
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--engine-text-muted)] mb-4">Contato</p>
            <label htmlFor="edit-profile-phone" className="text-sm font-medium text-[var(--engine-text)]">Telefone</label>
            {/* O mesmo campo do cadastro: uma string só, "+55 (11) 91234-5678".
                O modal antigo guardava o código num campo à parte e recusava o
                "+" do número que veio do cadastro. */}
            <div className="mt-2">
              <PhoneField
                inputId="edit-profile-phone"
                value={formData.phone}
                onChange={(value) => handleFieldChange('phone', value)}
                placeholder="(11) 99999-9999"
                selectClassName="py-2.5 pl-3 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm text-[var(--engine-text)] transition focus:outline-none focus:border-[var(--engine-accent)]"
                inputClassName={`px-3 py-2.5 bg-[var(--engine-elevated)] border rounded-lg text-sm text-[var(--engine-text)] transition focus:outline-none focus:border-[var(--engine-accent)] ${
                  errors.phone ? 'border-red-500' : 'border-[var(--engine-border)]'
                }`}
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
            )}
          </div>

          {/* Location */}
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--engine-text-muted)] mb-4">Localização</p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--engine-text)]">País</label>
                  <Select
                    value={formData.country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm transition focus:outline-none focus:border-[var(--engine-accent)]"
                  >
                    {countries.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--engine-text)]">Estado</label>
                  <Select
                    value={formData.state}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className="w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm transition focus:outline-none focus:border-[var(--engine-accent)]"
                  >
                    <option value="">Selecione</option>
                    {stateOptions.map(s => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--engine-text)]">Cidade</label>
                <input
                  type="text"
                  placeholder="São Paulo"
                  maxLength={80}
                  value={formData.city}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  className="w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm transition focus:outline-none focus:border-[var(--engine-accent)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex gap-3 p-4 sm:p-6 border-t border-[var(--engine-border)] bg-[var(--engine-surface)]">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-[var(--engine-accent)] text-white font-semibold rounded-lg transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-transparent text-[var(--engine-text)] border border-[var(--engine-border)] font-semibold rounded-lg transition hover:bg-[var(--engine-surface-2)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
