import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const defaultForm = {
  role: 'volunteer',
  fullName: '',
  email: '',
  phone: '',
  bio: '',
  skills: '',
  address: '',
  dateOfBirth: '',
  profileImageUrl: '',
  volunteerDocumentUrl: '',
  organizationName: '',
  registrationNumber: '',
  organizationAddress: '',
  organizationWebsite: '',
  contactPerson: '',
  organizationDescription: '',
  ngoProofDocumentUrl: '',
};

function buildApiUrl(path) {
  return API_BASE ? `${API_BASE}${path}` : path;
}

function isJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('application/json');
}

function isHtmlResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.toLowerCase().includes('text/html');
}

async function readResponseJson(response) {
  if (!isJsonResponse(response)) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getAuthHeaders(includeJsonContentType = true) {
  const token = localStorage.getItem('token');
  return {
    ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeRole(role) {
  return String(role || '').toLowerCase() === 'ngo' ? 'ngo' : 'volunteer';
}

function mapUserToForm(user) {
  const role = normalizeRole(user?.role);
  return {
    role,
    fullName: user?.fullName || user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    bio: user?.bio || '',
    skills: Array.isArray(user?.skills) ? user.skills.join(', ') : '',
    address: user?.address || '',
    dateOfBirth: user?.dateOfBirth || user?.dob || '',
    profileImageUrl: user?.profileImageUrl || user?.avatarUrl || '',
    volunteerDocumentUrl:
      user?.volunteerDocumentUrl || user?.documentUrl || user?.resumeUrl || '',
    organizationName: user?.organizationName || user?.organization?.name || '',
    registrationNumber:
      user?.registrationNumber || user?.organization?.registrationNumber || '',
    organizationAddress: user?.organizationAddress || user?.organization?.address || '',
    organizationWebsite: user?.organizationWebsite || user?.organization?.website || '',
    contactPerson: user?.contactPerson || user?.organization?.contactPerson || '',
    organizationDescription: user?.organizationDescription || user?.organization?.description || '',
    ngoProofDocumentUrl: user?.ngoProofDocumentUrl || user?.organization?.proofDocumentUrl || '',
  };
}

function extractFilename(urlOrName) {
  if (!urlOrName) {
    return '';
  }

  try {
    const url = new URL(urlOrName);
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || 'document');
  } catch {
    return String(urlOrName).split('/').pop() || 'document';
  }
}

function formatFileSize(bytes) {
  if (!bytes || Number.isNaN(bytes)) {
    return '';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  return `${(kb / 1024).toFixed(1)} MB`;
}

function buildDocumentHref(documentUrl) {
  if (!documentUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(documentUrl)) {
    return documentUrl;
  }

  if (!API_BASE) {
    return documentUrl;
  }

  const normalizedBase = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  return documentUrl.startsWith('/')
    ? `${normalizedBase}${documentUrl}`
    : `${normalizedBase}/${documentUrl}`;
}

function buildFormData(form, volunteerDocumentFile, ngoProofFile, removeVolunteerDocument, removeNgoProofDocument) {
  const payload = new FormData();
  payload.append('role', form.role);
  payload.append('fullName', form.fullName.trim());
  payload.append('email', form.email.trim());
  payload.append('phone', form.phone.trim());
  payload.append('bio', form.bio.trim());
  payload.append('address', form.address.trim());
  payload.append('dateOfBirth', form.dateOfBirth);
  payload.append('profileImageUrl', form.profileImageUrl.trim());

  if (form.role === 'volunteer') {
    payload.append(
      'skills',
      JSON.stringify(
        form.skills
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      )
    );

    if (volunteerDocumentFile) {
      payload.append('file', volunteerDocumentFile);
    }

    if (removeVolunteerDocument) {
      payload.append('removeDocument', 'true');
    }
  }

  if (form.role === 'ngo') {
    payload.append('organizationName', form.organizationName.trim());
    payload.append('registrationNumber', form.registrationNumber.trim());
    payload.append('organizationAddress', form.organizationAddress.trim());
    payload.append('organizationWebsite', form.organizationWebsite.trim());
    payload.append('contactPerson', form.contactPerson.trim());
    payload.append('organizationDescription', form.organizationDescription.trim());

    if (ngoProofFile) {
      payload.append('ngoProofFile', ngoProofFile);
    }

    if (removeNgoProofDocument) {
      payload.append('removeNgoProofDocument', 'true');
    }
  }

  return payload;
}

export default function ProfileEditPage() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [toast, setToast] = useState('');
  const [volunteerDocumentFile, setVolunteerDocumentFile] = useState(null);
  const [ngoProofFile, setNgoProofFile] = useState(null);
  const [removeVolunteerDocument, setRemoveVolunteerDocument] = useState(false);
  const [removeNgoProofDocument, setRemoveNgoProofDocument] = useState(false);

  const volunteerSelectedFileHref = useMemo(
    () => (volunteerDocumentFile ? URL.createObjectURL(volunteerDocumentFile) : ''),
    [volunteerDocumentFile]
  );

  const ngoSelectedFileHref = useMemo(
    () => (ngoProofFile ? URL.createObjectURL(ngoProofFile) : ''),
    [ngoProofFile]
  );

  useEffect(() => {
    let mounted = true;

    async function loadCurrentProfile() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(buildApiUrl('/users/me'), {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          if (isHtmlResponse(response)) {
            throw new Error('API not reachable. Set VITE_API_BASE_URL to your backend URL.');
          }
          throw new Error('Unable to fetch profile details.');
        }

        const user = await readResponseJson(response);
        if (!user || typeof user !== 'object') {
          throw new Error('Invalid profile data from server.');
        }

        if (mounted) {
          setForm(mapUserToForm(user));
          setVolunteerDocumentFile(null);
          setNgoProofFile(null);
          setRemoveVolunteerDocument(false);
          setRemoveNgoProofDocument(false);
        }
      } catch (requestError) {
        if (mounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Failed to load profile data.'
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadCurrentProfile();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setToast('');
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (volunteerSelectedFileHref) {
        URL.revokeObjectURL(volunteerSelectedFileHref);
      }
    };
  }, [volunteerSelectedFileHref]);

  useEffect(() => {
    return () => {
      if (ngoSelectedFileHref) {
        URL.revokeObjectURL(ngoSelectedFileHref);
      }
    };
  }, [ngoSelectedFileHref]);

  const roleLabel = useMemo(() => (form.role === 'ngo' ? 'NGO' : 'Volunteer'), [form.role]);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function isAllowedDocument(file) {
    const allowedMimeTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const lowerName = file.name.toLowerCase();
    return allowedMimeTypes.includes(file.type) || lowerName.endsWith('.pdf') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx');
  }

  function handleVolunteerFileChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      return;
    }

    if (!isAllowedDocument(file)) {
      setError('Please upload a PDF or DOC file only.');
      event.target.value = '';
      return;
    }

    setError('');
    setVolunteerDocumentFile(file);
    setRemoveVolunteerDocument(false);
  }

  function handleNgoProofChange(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      return;
    }

    if (!isAllowedDocument(file)) {
      setError('Please upload a PDF or DOC file only.');
      event.target.value = '';
      return;
    }

    setError('');
    setNgoProofFile(file);
    setRemoveNgoProofDocument(false);
  }

  function handleRemoveVolunteerFile() {
    setVolunteerDocumentFile(null);
    setForm((previous) => ({ ...previous, volunteerDocumentUrl: '' }));
    setRemoveVolunteerDocument(true);
  }

  function handleRemoveNgoProofFile() {
    setNgoProofFile(null);
    setForm((previous) => ({ ...previous, ngoProofDocumentUrl: '' }));
    setRemoveNgoProofDocument(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    setUploadProgress(0);

    try {
      const response = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', buildApiUrl('/users/me'));

        const authHeaders = getAuthHeaders(false);
        Object.entries(authHeaders).forEach(([header, value]) => {
          request.setRequestHeader(header, value);
        });

        request.responseType = 'text';

        request.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) {
            return;
          }

          const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          setUploadProgress(percent);
        };

        request.onerror = () => reject(new Error('Network error while updating profile.'));
        request.onload = () => {
          resolve({
            ok: request.status >= 200 && request.status < 300,
            status: request.status,
            text: request.responseText || '',
            contentType: request.getResponseHeader('content-type') || '',
          });
        };

        const formData = buildFormData(
          form,
          volunteerDocumentFile,
          ngoProofFile,
          removeVolunteerDocument,
          removeNgoProofDocument
        );
        request.send(formData);
      });

      if (!response.ok) {
        if (String(response.contentType).toLowerCase().includes('text/html')) {
          throw new Error('API not reachable. Set VITE_API_BASE_URL to your backend URL.');
        }

        let body = null;
        try {
          body = response.text ? JSON.parse(response.text) : null;
        } catch {
          body = null;
        }

        const serverMessage =
          body && typeof body === 'object' && typeof body.message === 'string'
            ? body.message
            : null;

        if (serverMessage) {
          throw new Error(serverMessage);
        }

        throw new Error('Profile update failed. Please try again.');
      }

      let updatedUser = null;
      try {
        updatedUser = response.text ? JSON.parse(response.text) : null;
      } catch {
        updatedUser = null;
      }

      if (updatedUser && typeof updatedUser === 'object') {
        setForm(mapUserToForm(updatedUser));
      }

      try {
        const latestProfileResponse = await fetch(buildApiUrl('/users/me'), {
          method: 'GET',
          headers: getAuthHeaders(),
        });

        if (latestProfileResponse.ok) {
          const latestUser = await readResponseJson(latestProfileResponse);
          if (latestUser && typeof latestUser === 'object') {
            setForm(mapUserToForm(latestUser));
          }
        }
      } catch {
      }

      setVolunteerDocumentFile(null);
      setNgoProofFile(null);
      setRemoveVolunteerDocument(false);
      setRemoveNgoProofDocument(false);
      setSuccess('Your profile has been updated successfully.');
      setToast('Profile updated successfully.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Unable to update profile.'
      );
    } finally {
      setSaving(false);
      setUploadProgress(0);
    }
  }

  if (loading) {
    return (
      <main className="profile-page">
        <section className="profile-card loading-card">Loading your profile...</section>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <header className="profile-header">
          <div>
            <p className="eyebrow">Account Settings</p>
            <h1>Edit Profile</h1>
            <p className="subtext">Keep your details updated for better volunteer-NGO matching.</p>
          </div>
          <span className={`role-pill ${form.role}`}>{roleLabel}</span>
        </header>

        {error ? <p className="message error">{error}</p> : null}
        {success ? <p className="message success">{success}</p> : null}
        {toast ? <div className="toast">{toast}</div> : null}

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label>
              Full Name
              <input name="fullName" value={form.fullName} onChange={handleChange} required />
            </label>

            <label>
              Email
              <input type="email" name="email" value={form.email} onChange={handleChange} required disabled />
            </label>

            <label>
              Phone
              <input name="phone" value={form.phone} onChange={handleChange} placeholder="+91" />
            </label>

            <label>
              Role
              <input value={roleLabel} disabled />
            </label>
          </div>

          <label>
            Bio
            <textarea
              name="bio"
              value={form.bio}
              onChange={handleChange}
              rows={4}
              placeholder="Share your interests, mission, and impact focus"
            />
          </label>

          <div className="field-grid">
            <label>
              Address
              <input
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Street, City, State"
              />
            </label>

            <label>
              Date of Birth
              <input type="date" name="dateOfBirth" value={form.dateOfBirth} onChange={handleChange} />
            </label>
          </div>

          {form.role === 'volunteer' ? (
            <>
              <label>
                Skills
                <textarea
                  name="skills"
                  value={form.skills}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Teaching, Event Management, Fundraising"
                />
              </label>

              <div className="document-section">
                <h2>Volunteer Document</h2>
                {form.volunteerDocumentUrl ? (
                  <div className="file-row">
                    <p className="file-meta">
                      Current File: {extractFilename(form.volunteerDocumentUrl)}
                    </p>
                    <a
                      className="file-link-btn"
                      href={buildDocumentHref(form.volunteerDocumentUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View File
                    </a>
                  </div>
                ) : (
                  <p className="file-meta">Current File: Not uploaded</p>
                )}

                <label>
                  {form.volunteerDocumentUrl ? 'Replace File' : 'Upload File'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleVolunteerFileChange}
                  />
                </label>

                {volunteerDocumentFile ? (
                  <div className="file-row">
                    <p className="file-meta">
                      Selected: {volunteerDocumentFile.name} ({formatFileSize(volunteerDocumentFile.size)})
                    </p>
                    <a className="file-link-btn" href={volunteerSelectedFileHref} target="_blank" rel="noreferrer">
                      View File
                    </a>
                  </div>
                ) : null}

                {(form.volunteerDocumentUrl || volunteerDocumentFile) ? (
                  <button type="button" className="secondary-btn" onClick={handleRemoveVolunteerFile}>
                    Remove File
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {form.role === 'ngo' ? (
            <div className="ngo-section">
              <h2>Organization Details</h2>
              <div className="field-grid">
                <label>
                  Organization Name
                  <input
                    name="organizationName"
                    value={form.organizationName}
                    onChange={handleChange}
                    required
                  />
                </label>

                <label>
                  Registration Number
                  <input
                    name="registrationNumber"
                    value={form.registrationNumber}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  NGO Address
                  <input
                    name="organizationAddress"
                    value={form.organizationAddress}
                    onChange={handleChange}
                  />
                </label>

                <label>
                  Organization Website
                  <input
                    name="organizationWebsite"
                    value={form.organizationWebsite}
                    onChange={handleChange}
                    placeholder="https://ngo.org"
                  />
                </label>

                <label>
                  Contact Person
                  <input
                    name="contactPerson"
                    value={form.contactPerson}
                    onChange={handleChange}
                  />
                </label>
              </div>

              <label>
                Organization Description
                <textarea
                  name="organizationDescription"
                  value={form.organizationDescription}
                  onChange={handleChange}
                  rows={4}
                  required
                />
              </label>

              <div className="document-section">
                <h2>NGO Proof Document</h2>
                {form.ngoProofDocumentUrl ? (
                  <div className="file-row">
                    <p className="file-meta">
                      Current File: {extractFilename(form.ngoProofDocumentUrl)}
                    </p>
                    <a
                      className="file-link-btn"
                      href={buildDocumentHref(form.ngoProofDocumentUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View File
                    </a>
                  </div>
                ) : (
                  <p className="file-meta">Current File: Not uploaded</p>
                )}

                <label>
                  {form.ngoProofDocumentUrl ? 'Replace File' : 'Upload File'}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleNgoProofChange}
                  />
                </label>

                {ngoProofFile ? (
                  <div className="file-row">
                    <p className="file-meta">
                      Selected: {ngoProofFile.name} ({formatFileSize(ngoProofFile.size)})
                    </p>
                    <a className="file-link-btn" href={ngoSelectedFileHref} target="_blank" rel="noreferrer">
                      View File
                    </a>
                  </div>
                ) : null}

                {(form.ngoProofDocumentUrl || ngoProofFile) ? (
                  <button type="button" className="secondary-btn" onClick={handleRemoveNgoProofFile}>
                    Remove File
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {saving ? (
            <div className="upload-progress" aria-live="polite">
              Upload progress: {uploadProgress}%
            </div>
          ) : null}

          <button type="submit" className="save-btn" disabled={saving}>
            {saving ? 'Saving changes...' : 'Save Changes'}
          </button>
        </form>
      </section>
    </main>
  );
}
