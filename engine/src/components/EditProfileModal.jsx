import { useState, useRef } from 'react';
import { auth, updateAuthProfile } from '../services/supabase';
import { engineDB } from '../services/db';
import { splitPhone, isPhoneValid } from '../services/phone';
import { PhoneField } from './PhoneField';
import { countries, getStates } from '../services/locations';
import { AVATAR, BANNER, reduzirImagem } from '../services/imagens';
import { storeDataUri } from '../services/photos';
import { useToast } from './ToastProvider';
import { useHistoryDismiss } from '../hooks/useHistoryDismiss';

// Salva pelo mesmo caminho das Configurações (engineDB.saveSettings), que
// reserva o @, grava os ajustes e espelha o perfil público. Antes o modal
// escrevia direto em publicProfiles, com o @ sem a arroba e com nomes de campo
// que o perfil não lê: o nome não mudava, a capa não aparecia e o perfil
// sumia da busca por @.
export function EditProfileModal({ isOpen, onClose, onSave, settings = {} }) {
  const user = auth.currentUser;
  const showToast = useToast();
  const profile = settings.profile || {};

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

  const avatarInputRef = useRef(null);
  const bannerInputRef = useRef(null);

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

  const handleBioChange = (value) => {
    if (value.length <= 160) {
      handleFieldChange('bio', value);
      setBioCharCount(value.length);
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

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleBannerClick = () => {
    bannerInputRef.current?.click();
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
      const saved = await engineDB.saveSettings(
        {
          ...settings,
          profile: {
            ...profile,
            displayName: formData.displayName,
            username: formData.username,
            bio: formData.bio,
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
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileInput('banner', e.target.files?.[0])}
              />
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
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileInput('avatar', e.target.files?.[0])}
                />
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
                <label className="text-sm font-medium text-[var(--engine-text)]">Bio</label>
                <textarea
                  maxLength={160}
                  placeholder="Conte sobre você"
                  value={formData.bio}
                  onChange={(e) => handleBioChange(e.target.value)}
                  className="w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm resize-none min-h-24 transition focus:outline-none focus:border-[var(--engine-accent)] focus:ring-4 focus:ring-[var(--engine-accent)]/20"
                />
                <p className="text-xs text-[var(--engine-text-subtle)] mt-1">{bioCharCount}/160</p>
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
                  <select
                    value={formData.country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm transition focus:outline-none focus:border-[var(--engine-accent)]"
                  >
                    {countries.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--engine-text)]">Estado</label>
                  <select
                    value={formData.state}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className="w-full px-3 py-2.5 mt-2 bg-[var(--engine-elevated)] border border-[var(--engine-border)] rounded-lg text-sm transition focus:outline-none focus:border-[var(--engine-accent)]"
                  >
                    <option value="">Selecione</option>
                    {stateOptions.map(s => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
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
